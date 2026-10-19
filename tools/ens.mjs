/**
 * ENS reverse resolution with forward-confirmation.
 * Zero dependencies; uses tools/crypto.mjs for keccak/namehash.
 */
import { namehash, toHex } from './crypto.mjs';

// ENS PublicResolver (mainnet); PublicResolver address is stable since 2019.
const REVERSE_REGISTRAR_RESOLVER = '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e';
const SEL_RESOLVER = '0x0178b8bf'; // resolver(bytes32)
const SEL_NAME = '0x691f3431'; // name(bytes32)
const SEL_ADDR = '0x3b3b57de'; // addr(bytes32)

const nh = (name) => toHex(namehash(name)).slice(2);

/** Decode an ABI-encoded `string` return value. */
export function decodeString(res) {
  if (!res || res === '0x') return '';
  const h = res.slice(2);
  if (h.length < 128) return '';
  const off = parseInt(h.slice(0, 64), 16) * 2; // head offset (bytes -> hex chars)
  if (off + 64 > h.length) return '';
  const len = parseInt(h.slice(off, off + 64), 16) * 2;
  return Buffer.from(h.slice(off + 64, off + 64 + len), 'hex').toString('utf8');
}

/**
 * Reverse-resolve `addr` to an ENS name, forward-confirming that the name's
 * `addr` record points back at `addr`. Returns null when unmanaged, unnamed,
 * or mismatched. `rpc` is an async (method, params) JSON-RPC caller.
 */
export async function resolveName(rpc, addr) {
  addr = addr.toLowerCase().replace(/^0x/, '');
  const rn = nh(addr + '.addr.reverse');
  let r;
  try {
    r = await rpc('eth_call', [{ to: REVERSE_REGISTRAR_RESOLVER, data: SEL_RESOLVER + rn }, 'latest']);
  } catch {
    return null;
  }
  if (!r || r === '0x') return null;
  const resolver = '0x' + r.slice(-40);
  if (/^0x0+$/.test(resolver)) return null;
  let name;
  try {
    name = decodeString(await rpc('eth_call', [{ to: resolver, data: SEL_NAME + rn }, 'latest']));
  } catch {
    return null;
  }
  if (!name) return null;
  // forward confirmation
  const fn = nh(name);
  try {
    const fres = await rpc('eth_call', [{ to: REVERSE_REGISTRAR_RESOLVER, data: SEL_RESOLVER + fn }, 'latest']);
    if (!fres || fres === '0x') return null;
    const fresolver = '0x' + fres.slice(-40);
    if (/^0x0+$/.test(fresolver)) return null;
    const fwd = await rpc('eth_call', [{ to: fresolver, data: SEL_ADDR + fn }, 'latest']);
    if (!fwd || fwd === '0x') return null;
    return fwd.slice(-40).toLowerCase() === addr ? name : null;
  } catch {
    return null;
  }
}

/** Resolve a batch of addresses; returns { address: name|null }. */
export async function resolveNames(rpc, addrs) {
  const out = {};
  for (const a of addrs) out[a] = await resolveName(rpc, a);
  return out;
}