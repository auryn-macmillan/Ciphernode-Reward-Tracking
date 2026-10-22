#!/usr/bin/env node
/**
 * Pin IPP-001 artifacts to IPFS via Pinata (the 48h-dispute artifact per §3).
 *
 * Pins, and records CIDs in pinnings.json:
 *   - state.json            (once per content change, tracked by sha256)
 *   - payouts/epoch-N.settlement.md   (once, per completed epoch)
 *   - payouts/epoch-N.safe.json       (once, per completed epoch)
 *
 * Auth — supply ONE of these (GitHub Actions secrets):
 *   PINATA_JWT          Pinata Developer JWT  → v3 API, Authorization: Bearer <jwt>   (recommended)
 *   PINATA_API_KEY      legacy API key        → v1 API, X-API-Key: <key>
 *   PINATA_API_USER     legacy API user id    → v1 API, X-API-User: <id>   (with PINATA_API_KEY)
 *
 * Best-effort: on missing creds or API error it logs and exits 0 so a Pinata
 * hiccup never fails the state refresh. Pass --dry-run to print what would be
 * pinned without calling the API.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const join = (...p) => path.join(ROOT, ...p);
const DRY = process.argv.includes('--dry-run');

const JWT = process.env.PINATA_JWT;
const API_KEY = process.env.PINATA_API_KEY;
const API_USER = process.env.PINATA_API_USER;
if (!DRY && !JWT && !API_KEY) {
  console.log('pin: no Pinata credentials (set PINATA_JWT, or PINATA_API_KEY + PINATA_API_USER) — skipping');
  process.exit(0);
}

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

function loadPinnings() {
  const f = join('pinnings.json');
  if (!existsSync(f)) return { state: null, epochs: {} };
  try {
    return JSON.parse(readFileSync(f, 'utf8'));
  } catch {
    return { state: null, epochs: {} };
  }
}

async function uploadV3(name, bytes, keyvalues) {
  const fd = new FormData();
  fd.set('file', new Blob([bytes]), name);
  fd.set('network', 'mainnet');
  fd.set('name', name);
  if (keyvalues) fd.set('keyvalues', JSON.stringify(keyvalues));
  const res = await fetch('https://uploads.pinata.cloud/v3/files', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + JWT },
    body: fd,
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`upload ${res.status}: ${JSON.stringify(j).slice(0, 300)}`);
  if (!j.cid) throw new Error(`no cid in response: ${JSON.stringify(j).slice(0, 300)}`);
  return j.cid;
}

async function pinV1(name, text, keyvalues) {
  const res = await fetch('https://api.pinata.cloud/pinning/pinByString', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY,
      'X-API-User': API_USER,
    },
    body: JSON.stringify({
      pinataContent: text,
      pinataMetadata: { name, keyvalues: keyvalues || {} },
    }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`pinByString ${res.status}: ${JSON.stringify(j).slice(0, 300)}`);
  if (!j.IpfsHash) throw new Error(`no IpfsHash in response: ${JSON.stringify(j).slice(0, 300)}`);
  return j.IpfsHash;
}

async function pin(name, bytes, keyvalues) {
  if (JWT) return uploadV3(name, bytes, keyvalues);
  return pinV1(name, bytes.toString('utf8'), keyvalues);
}

async function main() {
  const pinnings = loadPinnings();
  const now = new Date().toISOString();
  const results = [];

  // 1) state.json — pin when content changed since last pin
  const stateBuf = readFileSync(join('state.json'));
  const stateHash = sha256(stateBuf);
  if (pinnings.state?.contentHash === stateHash) {
    results.push(['state.json', pinnings.state.cid, 'unchanged']);
  } else if (DRY) {
    results.push(['state.json', '(dry-run)', 'would pin']);
  } else {
    const cid = await pin('ipp-001-state.json', stateBuf, { kind: 'state', program: 'IPP-001' });
    pinnings.state = { cid, pinnedAt: now, contentHash: stateHash };
    results.push(['state.json', cid, 'pinned']);
  }

  // 2) completed epochs — pin settlement sheet + safe payload once each
  const state = JSON.parse(stateBuf.toString('utf8'));
  for (const ep of state.epochs) {
    if (ep.status !== 'complete') continue;
    const rec = pinnings.epochs[ep.index] ?? {};
    const sheetPath = `epoch-${ep.index}.settlement.md`;
    const safePath = `epoch-${ep.index}.safe.json`;
    const kv = { kind: 'settlement', epoch: String(ep.index), program: 'IPP-001' };
    const sheetBuf = readFileSync(join('payouts', sheetPath));
    const safeBuf = readFileSync(join('payouts', safePath));

    if (!rec.sheetCid && !DRY) {
      rec.sheetCid = await pin(`ipp-001-epoch-${ep.index}-settlement.md`, sheetBuf, kv);
      rec.sheetPinnedAt = now;
    } else if (!rec.sheetCid) {
      rec.sheetCid = '(dry-run)';
    }
    if (!rec.safeCid && !DRY) {
      rec.safeCid = await pin(`ipp-001-epoch-${ep.index}-safe.json`, safeBuf, {
        kind: 'safe-payload',
        epoch: String(ep.index),
        program: 'IPP-001',
      });
      rec.safePinnedAt = now;
    } else if (!rec.safeCid) {
      rec.safeCid = '(dry-run)';
    }
    pinnings.epochs[ep.index] = rec;
    const st = DRY ? 'would pin' : rec.sheetPinnedAt ? 'pinned' : 'existing';
    const sf = DRY ? 'would pin' : rec.safePinnedAt ? 'pinned' : 'existing';
    results.push([`epoch ${ep.index} settlement`, rec.sheetCid, st]);
    results.push([`epoch ${ep.index} safe payload`, rec.safeCid, sf]);
  }

  for (const [name, cid, status] of results) console.log(`${status.padEnd(10)} ${name.padEnd(30)} ${cid}`);
  if (!DRY) writeFileSync(join('pinnings.json'), JSON.stringify(pinnings, null, 2) + '\n');
  console.log(`pinnings.json ${DRY ? 'not written (dry-run)' : 'written'}`);
}

main().catch((e) => {
  console.error('pin: ' + e.message);
  process.exit(0); // best-effort: never fail the refresh
});