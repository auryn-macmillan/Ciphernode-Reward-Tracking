#!/usr/bin/env node
/**
 * IPP-001 Ciphernode Rewards Program — on-chain accrual tracker.
 *
 * Replays the Interfold mainnet event log from the launch block (T0) forward,
 * reconstructs the per-block "active" state of every registered ciphernode,
 * and computes each node operator's ticket-block accrual per epoch exactly as
 * specified in IPP-001:
 *
 *   credited(operator, block) = min(8, Σ ticketCount(node) for the operator's
 *                                 nodes passing the "active" predicate at that block)
 *   ticket_blocks(operator, epoch) = Σ credited × 1 block
 *   payout estimate = epoch pool × ticket_blocks / Σ ticket_blocks
 *
 * "Active" predicate (IPP-001 §3): registered ∧ bonded ≥ active-maintenance
 * floor ∧ ≥ minTicketBalance tickets ∧ not banned. Bond-owner attribution is
 * evaluated per block from BondOwnerSet history (Foundation common-control
 * determinations are layered on top of this default; see README).
 *
 * Zero dependencies (Node >= 18: global fetch). Reads RPC_URL from env.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// ---------------------------------------------------------------- config ---
const RPC = process.env.RPC_URL;
if (!RPC) {
  console.error('RPC_URL is required (archive-node Ethereum mainnet JSON-RPC).');
  process.exit(1);
}

const ADDR = {
  interfold: '0x28cF63B459e6218C69EA97ea7D90541cf648c715',
  ciphernodeRegistry: '0xC927A5B2d8F68697bC28C0670df05178c93df2d7',
  bondingRegistry: '0x0ec90465095C21830BEcED07e032809A2Bd2915F',
  slashingManager: '0x753109Ee36Dc65cC178875AddA30C6433e5bEEe4',
  ticketToken: '0xC0B5b49a3949eC4B520eF21BaCFE16e3695F3B5D',
  // Settlement-side (IPP-001 §3: payouts are VE-locked FOLD via createLockFor)
  foldToken: '0xE172e9B6cfBeeB5593bDcE3f077356FDb33af904',
  voteEscrow: '0x71360F335e4Ec9c010e29bA7171bc62c9B4c1F12',
  foundationSafe: '0x8B43b2852fc5031D01DDfCDF702973D93A2FF593', // v1.4.1 (on-chain VERSION())
  multiSend: '0x38869bf66a61cF6bDB996A6aE40D5853Fd43B526', // v1.4.1 deployment
};
const DEPLOY = {
  // Earliest contract whose events can affect accrual (BondingRegistry).
  scanFrom: 25473398n,
};

// IPP-001 program parameters
const PROGRAM = {
  id: 'IPP-001',
  name: 'Initial Ciphernode Rewards Program',
  t0Block: 25786382n, // Interfold mainnet deployment block
  epochSeconds: 14n * 24n * 3600n,
  epochs: 6,
  weights: [1n, 1n, 2n, 3n, 5n, 8n], // Fibonacci backload
  totalPool: 10n ** 18n * 12_000_000n, // 12,000,000 FOLD (18 decimals)
  cap: 8n, // max credited tickets per operator per block
  proposal:
    'https://aquamarine-added-basilisk-78.mypinata.cloud/ipfs/bafkreicnfxpcqvygwn4kmhlpmgndcavaldumzbvybtlatgahj6uwuc73xu',
};

// Event topics (keccak256 of canonical signatures; verified against
// theinterfold/interfold contract artifacts).
const TOPIC = {
  CiphernodeAdded: '0x3318d261fe14a5761d2d1e21555652f623d2134c430a9883c9ad6e958bb0db53',
  CiphernodeRemoved: '0x8c008e3835f6c79bfcdb89f0f6ca8705e0b01049ee84a90b0e4da1c7ba9405d5',
  TicketBalanceUpdated: '0x51499681e2c0f67f5df906558cc5b02bba47d9fbedc196587288f05a81f95e7e',
  CiphernodeBondUpdated: '0x44531399782522f4b3af2024d45433c4072555c68c786f2c9a6943a0ca974b2c',
  BondOwnerSet: '0xf09dc4a8a4e1c9233bcb1d32c04ad4c9d516f140c23aa44f9e0d680f70799e08',
  NodeBanUpdated: '0x459f7b4f723dbbc6281258a697d9bf8a2564b0d0f5ddb40cd04515e43050f9b8',
  ConfigurationUpdated: '0x267ae0ed351cb5b33bc50158aa20231f6fe9dae49bf24c85e2d40686b32a1c0a',
  // keccak256('BondingAssetConfigUpdated(address,address,uint256,uint256,uint8,uint8,uint64)')
  BondingAssetConfigUpdated: '0x06d91437aa182257e590c8092840f4ee83c3dabc4a93e6a7af8636185635618f',
};

const LOG_CHUNK = 2000n; // blocks per eth_getLogs query

// ------------------------------------------------------------------ rpc ---
import { resolveNames } from './ens.mjs';
import { buildEpochPayload } from './safe.mjs';

async function rpc(method, params, attempt = 0) {
  try {
    const res = await fetch(RPC, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    const j = await res.json();
    if (j.error) throw new Error(`${method}: ${JSON.stringify(j.error)}`);
    return j.result;
  } catch (e) {
    if (attempt >= 5) throw e;
    const delay = Math.min(15000, 500 * 2 ** attempt);
    console.warn(`  rpc retry ${attempt + 1} (${method}): ${e.message.slice(0, 120)}`);
    await new Promise((r) => setTimeout(r, delay));
    return rpc(method, params, attempt + 1);
  }
}

const hexBig = (h) => BigInt(h === '0x' || h == null ? 0 : h);

async function blockInfo(n) {
  const b = await rpc('eth_getBlockByNumber', ['0x' + BigInt(n).toString(16), false]);
  if (!b) throw new Error(`block ${n} not found`);
  return { number: BigInt(b.number), ts: hexBig(b.timestamp) };
}

/** First block with timestamp >= targetTs (binary search in [lo, hi]).
 *  Returns null when the head block is still before targetTs (boundary not reached). */
async function blockAtOrAfter(lo, hi, targetTs) {
  let b = await blockInfo(hi);
  if (b.ts < targetTs) return null; // boundary not yet on-chain
  let a = await blockInfo(lo);
  if (a.ts >= targetTs) return a;
  while (b.number - a.number > 1n) {
    const mid = (a.number + b.number) / 2n;
    const m = await blockInfo(mid);
    if (m.ts >= targetTs) b = m;
    else a = m;
  }
  return b;
}

async function getLogsChunked(address, topics, from, to) {
  const out = [];
  let a = from;
  while (a <= to) {
    const b = a + LOG_CHUNK - 1n > to ? to : a + LOG_CHUNK - 1n;
    let lo = a;
    while (true) {
      try {
        const logs = await rpc('eth_getLogs', [
          { address, fromBlock: '0x' + lo.toString(16), toBlock: '0x' + b.toString(16), topics },
        ]);
        out.push(...logs);
        break;
      } catch (e) {
        // Provider range limits: shrink the window from the front.
        if (b - lo > 100n) {
          lo = lo + (b - lo) / 2n;
          continue;
        }
        throw e;
      }
    }
    a = b + 1n;
  }
  return out;
}

// ------------------------------------------------------------- utilities ---
const addr = (topicWord) => '0x' + topicWord.slice(-40).toLowerCase();
const word = (data, i) => hexBig('0x' + data.slice(2 + i * 64, 2 + (i + 1) * 64));
const strWord = (topicWord) =>
  Buffer.from(topicWord.slice(2), 'hex').toString('utf8').replace(/\0+$/, '');

function sortLogs(logs) {
  return logs.sort(
    (x, y) =>
      Number(BigInt(x.blockNumber) - BigInt(y.blockNumber)) ||
      Number(BigInt(x.logIndex) - BigInt(y.logIndex)),
  );
}

// ------------------------------------------------------------- main flow ---
async function main() {
  const t0 = Date.now();
  const head = hexBig(await rpc('eth_blockNumber', []));
  console.log(`head block: ${head}`);

  const t0Info = await blockInfo(PROGRAM.t0Block);
  console.log(`T0 = ${PROGRAM.t0Block} @ ts ${t0Info.ts}`);

  // Epoch boundary blocks (timestamp-driven 14-day epochs from T0).
  // Boundaries not yet reached on-chain are null.
  const epochBounds = [{ index: 0, block: t0Info.number, ts: t0Info.ts }];
  for (let e = 1; e <= PROGRAM.epochs; e++) {
    const target = t0Info.ts + BigInt(e) * PROGRAM.epochSeconds;
    const prev = epochBounds[e - 1];
    if (!prev) { epochBounds.push(null); continue; }
    const b = await blockAtOrAfter(prev.block, head, target);
    epochBounds.push(b ? { index: e, block: b.number, ts: b.ts } : null);
    if (b) console.log(`epoch ${e} boundary: block ${b.number} @ ts ${b.ts}`);
  }

  // ---- fetch all accrual-relevant events (scan from BondingRegistry deploy)
  const scanFrom = DEPLOY.scanFrom < t0Info.number ? DEPLOY.scanFrom : t0Info.number;
  console.log(`scanning events ${scanFrom} → ${head}`);
  const [added, removed, ticket, bond, owner, ban, cfg, assetCfg] = await Promise.all([
    getLogsChunked(ADDR.ciphernodeRegistry, [TOPIC.CiphernodeAdded], scanFrom, head),
    getLogsChunked(ADDR.ciphernodeRegistry, [TOPIC.CiphernodeRemoved], scanFrom, head),
    getLogsChunked(ADDR.bondingRegistry, [TOPIC.TicketBalanceUpdated], scanFrom, head),
    getLogsChunked(ADDR.bondingRegistry, [TOPIC.CiphernodeBondUpdated], scanFrom, head),
    getLogsChunked(ADDR.bondingRegistry, [TOPIC.BondOwnerSet], scanFrom, head),
    getLogsChunked(ADDR.slashingManager, [TOPIC.NodeBanUpdated], scanFrom, head),
    getLogsChunked(ADDR.bondingRegistry, [TOPIC.ConfigurationUpdated], scanFrom, head),
    getLogsChunked(ADDR.bondingRegistry, [TOPIC.BondingAssetConfigUpdated], scanFrom, head),
  ]);
  console.log(
    `events: added=${added.length} removed=${removed.length} ticket=${ticket.length} ` +
      `bond=${bond.length} owner=${owner.length} ban=${ban.length} cfg=${cfg.length} assetCfg=${assetCfg.length}`,
  );

  // ---- config timeline: seed zero (values at BondingRegistry deploy were
  // unset) and replay every ConfigurationUpdated event from scanFrom.
  // (Verified: at T0 itself requiredCiphernodeBond == 0 — the parameters were
  // set at block 25788974, shortly after T0 — so event replay is the source.)
  const config = {
    requiredCiphernodeBond: 0n,
    ciphernodeBondActiveBps: 0n,
    minTicketBalance: 0n,
    ticketPrice: 0n,
  };
  const configTimeline = []; // {block, key, value}
  for (const l of sortLogs(cfg)) {
    const key = strWord(l.topics[1]);
    const next = word(l.data, 1);
    if (key in config) {
      config[key] = next;
      configTimeline.push({ block: BigInt(l.blockNumber), key, value: next.toString() });
    }
  }
  // BondingAssetConfigUpdated carries (ticketPrice, requiredCiphernodeBond)
  for (const l of sortLogs(assetCfg)) {
    const blk = BigInt(l.blockNumber);
    for (const [key, idx] of [
      ['ticketPrice', 0],
      ['requiredCiphernodeBond', 1],
    ]) {
      const next = word(l.data, idx);
      if (next !== 0n && next !== config[key]) {
        config[key] = next;
        configTimeline.push({ block: blk, key, value: next.toString() });
      }
    }
  }
  configTimeline.sort((a, b) => Number(a.block - b.block));

  // ---- per-node event timelines
  const nodes = new Map(); // addr -> {added:[], removed:[], tickets:[], bonds:[], owners:[], bans:[]}
  const node = (a) => {
    if (!nodes.has(a))
      nodes.set(a, { added: [], removed: [], tickets: [], bonds: [], owners: [], bans: [] });
    return nodes.get(a);
  };
  for (const l of sortLogs(added)) node(addr(l.topics[1])).added.push(BigInt(l.blockNumber));
  for (const l of sortLogs(removed)) node(addr(l.topics[1])).removed.push(BigInt(l.blockNumber));
  for (const l of sortLogs(ticket))
    node(addr(l.topics[1])).tickets.push([BigInt(l.blockNumber), word(l.data, 1)]); // newBalance
  for (const l of sortLogs(bond))
    node(addr(l.topics[1])).bonds.push([BigInt(l.blockNumber), word(l.data, 1)]); // newBond
  for (const l of sortLogs(owner))
    node(addr(l.topics[1])).owners.push([BigInt(l.blockNumber), addr(l.topics[2])]);
  for (const l of sortLogs(ban))
    node(addr(l.topics[1])).bans.push([BigInt(l.blockNumber), word(l.data, 1) !== 0n]);

  // ---- change points: every block where any relevant state changed
  const changeSet = new Set([t0Info.number]);
  for (const { block } of configTimeline) changeSet.add(block);
  for (const [, n] of nodes) {
    for (const b of n.added) changeSet.add(b);
    for (const b of n.removed) changeSet.add(b);
    for (const [b] of n.tickets) changeSet.add(b);
    for (const [b] of n.bonds) changeSet.add(b);
    for (const [b] of n.owners) changeSet.add(b);
    for (const [b] of n.bans) changeSet.add(b);
  }
  const changes = [...changeSet].filter((b) => b >= t0Info.number && b <= head).sort((x, y) => (x < y ? -1 : 1));

  // ---- sweep state at each change point; accumulate per epoch
  // State at block B = effect of all events with blockNumber <= B.
  const ptr = {}; // node addr -> per-list cursors
  for (const [a, n] of nodes)
    ptr[a] = { added: 0, removed: 0, tickets: 0, bonds: 0, owners: 0, bans: 0 };
  const st = {}; // node addr -> {registered, tickets, bond, owner, banned}
  const ensure = (a) =>
    (st[a] ??= { registered: false, tickets: 0n, bond: 0n, owner: null, banned: false });

  const epochPool = [];
  for (let e = 0; e < PROGRAM.epochs; e++)
    epochPool.push((PROGRAM.totalPool * PROGRAM.weights[e]) / 20n);

  // per epoch: operator -> ticketBlocks
  const epochTB = Array.from({ length: PROGRAM.epochs }, () => new Map());
  const epochBlocks = Array(PROGRAM.epochs).fill(0n); // blocks observed so far

  const applyUpTo = (blk) => {
    for (const [a, n] of nodes) {
      const p = ptr[a];
      const s = ensure(a);
      while (p.added < n.added.length && n.added[p.added] <= blk) {
        s.registered = true;
        p.added++;
      }
      while (p.removed < n.removed.length && n.removed[p.removed] <= blk) {
        s.registered = false;
        p.removed++;
      }
      while (p.tickets < n.tickets.length && n.tickets[p.tickets][0] <= blk) {
        s.tickets = n.tickets[p.tickets][1];
        p.tickets++;
      }
      while (p.bonds < n.bonds.length && n.bonds[p.bonds][0] <= blk) {
        s.bond = n.bonds[p.bonds][1];
        p.bonds++;
      }
      while (p.owners < n.owners.length && n.owners[p.owners][0] <= blk) {
        s.owner = n.owners[p.owners][1];
        p.owners++;
      }
      while (p.bans < n.bans.length && n.bans[p.bans][0] <= blk) {
        s.banned = n.bans[p.bans][1];
        p.bans++;
      }
    }
  };

  // config value at block (replay config timeline with its own cursor)
  let cfgPtr = 0;
  const cfgNow = { ...config };
  // reset then replay
  const cfgReset = {
    requiredCiphernodeBond: 0n,
    ciphernodeBondActiveBps: 0n,
    minTicketBalance: 0n,
    ticketPrice: 0n,
  };
  Object.assign(cfgNow, cfgReset);
  // single merged timeline (ConfigurationUpdated + BondingAssetConfigUpdated)
  const cfgEvents = configTimeline.map((c) => [c.block, c.key, BigInt(c.value)]);

  const applyCfgUpTo = (blk) => {
    while (cfgPtr < cfgEvents.length && cfgEvents[cfgPtr][0] <= blk) {
      cfgNow[cfgEvents[cfgPtr][1]] = cfgEvents[cfgPtr][2];
      cfgPtr++;
    }
  };

  const epochOf = (blk) => {
    for (let e = 0; e < PROGRAM.epochs; e++) {
      const start = epochBounds[e];
      if (!start) return -1; // later epochs not reached on-chain
      const end = epochBounds[e + 1];
      const endBlk = end ? end.block : head + 1n; // unreached boundary → open-ended
      if (blk >= start.block && blk < endBlk) return e;
    }
    return -1; // past program end
  };

  // effective epoch end block for segmentation
  const epochEndBlk = (e) => (epochBounds[e + 1] ? epochBounds[e + 1].block : head + 1n);

  for (let i = 0; i < changes.length; i++) {
    const from = changes[i];
    const to = i + 1 < changes.length ? changes[i + 1] : head + 1n; // exclusive
    applyUpTo(from);
    applyCfgUpTo(from);

    // credited per operator at this interval
    const perOp = new Map(); // owner -> credited tickets (uncapped sum first)
    for (const [a, s] of Object.entries(st)) {
      if (!s.registered || s.banned) continue;
      const bondFloor =
        cfgNow.requiredCiphernodeBond === 0n
          ? 0n
          : (cfgNow.requiredCiphernodeBond * cfgNow.ciphernodeBondActiveBps + 9999n) / 10000n;
      if (s.bond < bondFloor) continue;
      const ticketCount = cfgNow.ticketPrice === 0n ? 0n : s.tickets / cfgNow.ticketPrice;
      if (ticketCount < cfgNow.minTicketBalance) continue;
      const owner = s.owner ?? a; // default: node address itself
      perOp.set(owner, (perOp.get(owner) ?? 0n) + ticketCount);
    }

    // walk intervals split at epoch boundaries
    let cursor = from;
    while (cursor < to) {
      const e = epochOf(cursor);
      if (e < 0) break;
      const eEnd = epochEndBlk(e);
      const segEnd = to < eEnd ? to : eEnd;
      const len = segEnd - cursor;
      if (len > 0n) {
        epochBlocks[e] += len;
        for (const [owner, sum] of perOp) {
          const credited = sum > PROGRAM.cap ? PROGRAM.cap : sum;
          if (credited === 0n) continue;
          const m = epochTB[e];
          m.set(owner, (m.get(owner) ?? 0n) + credited * len);
        }
      }
      cursor = segEnd;
    }
  }

  // ---- ENS reverse resolution (forward-confirmed)
  const addrs = new Set();
  for (let e = 0; e < PROGRAM.epochs; e++) for (const op of epochTB[e].keys()) addrs.add(op);
  for (const [a, s] of Object.entries(st)) {
    if (s.registered) addrs.add(a);
    if (s.owner) addrs.add(s.owner);
  }
  console.log(`ENS: reverse-resolving ${addrs.size} addresses`);
  const ensRaw = await resolveNames(rpc, [...addrs].sort());
  const ens = {};
  for (const [a, n] of Object.entries(ensRaw)) if (n) ens[a] = n;
  console.log(`ENS: ${Object.keys(ens).length} resolved`);

  // ---- assemble state.json
  const now = new Date();
  const epochs = [];
  for (let e = 0; e < PROGRAM.epochs; e++) {
    const start = epochBounds[e];
    const end = epochBounds[e + 1];
    const status = !start
      ? 'upcoming'
      : end
        ? head >= end.block
          ? 'complete'
          : 'in-progress'
        : 'in-progress';
    const startBlock = start ? start.block : null;
    const endBlock = end ? end.block : null;
    const startTs = start ? Number(start.ts) : Number(t0Info.ts) + e * Number(PROGRAM.epochSeconds);
    const endTs = end ? Number(end.ts) : Number(t0Info.ts) + (e + 1) * Number(PROGRAM.epochSeconds);
    const tb = epochTB[e];
    const total = [...tb.values()].reduce((x, y) => x + y, 0n);
    const operators = [...tb.entries()]
      .map(([op, tblocks]) => ({
        operator: op,
        ens: ens[op] ?? null,
        ticketBlocks: tblocks.toString(),
        sharePct: total > 0n ? Number((tblocks * 10000n) / total) / 100 : 0,
        estPayoutWei: (total > 0n ? (epochPool[e] * tblocks) / total : 0n).toString(),
      }))
      .sort((a, b) => (a.ticketBlocks < b.ticketBlocks ? 1 : -1));
    epochs.push({
      index: e + 1,
      startBlock: startBlock ? startBlock.toString() : null,
      endBlock: endBlock ? endBlock.toString() : null,
      startTs,
      endTs,
      poolWei: epochPool[e].toString(),
      status,
      blocksObserved: epochBlocks[e].toString(),
      totalTicketBlocks: total.toString(),
      operatorCount: operators.length,
      operators,
    });
  }

  // current snapshot of every registered node
  applyUpTo(head);
  applyCfgUpTo(head);
  const snapshot = Object.entries(st)
    .filter(([, s]) => s.registered)
    .map(([a, s]) => ({
      node: a,
      operator: s.owner ?? a,
      ens: ens[s.owner ?? a] ?? ens[a] ?? null,
      ticketBalanceWei: s.tickets.toString(),
      tickets: cfgNow.ticketPrice === 0n ? 0 : Number(s.tickets / cfgNow.ticketPrice),
      bondWei: s.bond.toString(),
      banned: s.banned,
      active:
        s.bond >=
          (cfgNow.requiredCiphernodeBond * cfgNow.ciphernodeBondActiveBps + 9999n) / 10000n &&
        (cfgNow.ticketPrice === 0n ? 0n : s.tickets / cfgNow.ticketPrice) >=
          cfgNow.minTicketBalance &&
        !s.banned,
    }))
    .sort((a, b) => (a.operator < b.operator ? -1 : 1));

  const state = {
    schema: 1,
    generatedAt: now.toISOString(),
    headBlock: head.toString(),
    program: {
      ...PROGRAM,
      t0Block: PROGRAM.t0Block.toString(),
      t0Ts: Number(t0Info.ts),
      epochSeconds: Number(PROGRAM.epochSeconds),
      totalPool: PROGRAM.totalPool.toString(),
      weights: PROGRAM.weights.map(String),
    },
    config: {
      requiredCiphernodeBondWei: cfgNow.requiredCiphernodeBond.toString(),
      ciphernodeBondActiveBps: cfgNow.ciphernodeBondActiveBps.toString(),
      minTicketBalance: cfgNow.minTicketBalance.toString(),
      ticketPriceWei: cfgNow.ticketPrice.toString(),
      timeline: configTimeline.map((c) => ({ ...c, block: c.block.toString() })),
    },
    contracts: ADDR,
    ens,
    epochs,
    snapshot,
    notes: [
      'Estimates use default bond-owner attribution. Foundation common-control determinations (IPP-001 §3) may merge operators; the 8-credit cap then applies to the merged group.',
      'Epoch boundaries are timestamp-driven (14 days from T0); accrual is per block, so partial epochs accrue proportionally.',
      'Final settlement sheets are published by the Foundation per epoch after a 48h dispute window.',
    ],
  };

  const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'state.json');
  const json = JSON.stringify(state, (k, v) => (typeof v === 'bigint' ? v.toString() : v), 2);
  writeFileSync(out, json);

  // ---- Safe tx-builder payloads for completed epochs
  const payoutsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'payouts');
  mkdirSync(payoutsDir, { recursive: true });
  let payloadCount = 0;
  for (const ep of epochs) {
    if (ep.status !== 'complete') continue;
    const payload = buildEpochPayload({
      epochIndex: ep.index,
      poolWei: ep.poolWei,
      operators: ep.operators,
      ens,
      contracts: ADDR,
      generatedAt: state.generatedAt,
    });
    const f = path.join(payoutsDir, `epoch-${ep.index}.safe.json`);
    writeFileSync(f, JSON.stringify(payload, null, 2) + '\n');
    payloadCount++;
  }
  console.log(`wrote ${payloadCount} payout payload(s) to payouts/`);
  console.log(`wrote ${out} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});