/**
 * Minimal Keccak-256 (Ethereum variant) + ABI-encoding + ENS namehash.
 * Zero dependencies. Self-validates on import against known vectors.
 */

const RC = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
  0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
  0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
  0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
  0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
];
const ROT = [
  [0n, 36n, 3n, 41n, 18n],
  [1n, 44n, 10n, 45n, 2n],
  [62n, 6n, 43n, 15n, 61n],
  [28n, 55n, 25n, 21n, 56n],
  [27n, 20n, 39n, 8n, 14n],
];
const M64 = (1n << 64n) - 1n;

const rol = (x, n) => {
  n %= 64n;
  return n === 0n ? x : ((x << n) | (x >> (64n - n))) & M64;
};

function permute(S) {
  for (let rnd = 0; rnd < 24; rnd++) {
    const C = [0, 1, 2, 3, 4].map((x) => S[x][0] ^ S[x][1] ^ S[x][2] ^ S[x][3] ^ S[x][4]);
    const D = [0, 1, 2, 3, 4].map((x) => C[(x + 4) % 5] ^ rol(C[(x + 1) % 5], 1n));
    const B = Array.from({ length: 5 }, () => [0n, 0n, 0n, 0n, 0n]);
    for (let x = 0; x < 5; x++)
      for (let y = 0; y < 5; y++)
        B[y][(2 * x + 3 * y) % 5] = rol(S[x][y] ^ D[x], ROT[x][y]);
    for (let x = 0; x < 5; x++)
      for (let y = 0; y < 5; y++)
        S[x][y] = B[x][y] ^ ((~B[(x + 1) % 5][y] & M64) & B[(x + 2) % 5][y]);
    S[0][0] ^= RC[rnd];
  }
  return S;
}

/** keccak256 over a Uint8Array, returns Uint8Array(32). */
export function keccak256(msg) {
  const rate = 136;
  const S = Array.from({ length: 5 }, () => [0n, 0n, 0n, 0n, 0n]);
  const padLen = rate - (msg.length % rate);
  const pad = new Uint8Array(msg.length + padLen);
  pad.set(msg);
  pad[msg.length] = 0x01; // domain byte (keccak, not sha3)
  pad[pad.length - 1] |= 0x80;
  for (let off = 0; off < pad.length; off += rate) {
    for (let i = 0; i < rate / 8; i++) {
      let x = 0n;
      for (let b = 7; b >= 0; b--) x = (x << 8n) | BigInt(pad[off + i * 8 + b]);
      S[i % 5][(i / 5) | 0] ^= x;
    }
    permute(S);
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 4; i++) {
    let v = S[i % 5][(i / 5) | 0];
    for (let b = 0; b < 8; b++) {
      out[i * 8 + b] = Number(v & 0xffn);
      v >>= 8n;
    }
  }
  return out;
}

const utf8 = (s) => new TextEncoder().encode(s);
export const toHex = (u8) => '0x' + Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('');

export const keccakHex = (bytes) => toHex(keccak256(bytes));
export const keccakStr = (s) => keccakHex(utf8(s));
export const selector = (sig) => keccakStr(sig).slice(0, 10);

// ------------------------------------------------------------------ ABI ---
const WORD = 64; // hex chars
const padWord = (hexNo0x) => hexNo0x.padStart(WORD, '0');
export const padAddr = (a) => padWord(a.toLowerCase().replace(/^0x/, ''));
export const padInt = (v) => padWord(BigInt(v).toString(16));

/** head words for (address[], uint256[], address) — multiSend-style payloads */
export function encodeCall(sig, argsHex) {
  return selector(sig) + argsHex;
}

// --------------------------------------------------------------- namehash ---
export function namehash(name) {
  let node = new Uint8Array(32);
  if (name) {
    for (const label of name.toLowerCase().split('.').reverse()) {
      node = keccak256(concat(node, keccak256(utf8(label))));
    }
  }
  return node;
}

export const concat = (...arrs) => {
  const out = new Uint8Array(arrs.reduce((a, b) => a + b.length, 0));
  let o = 0;
  for (const a of arrs) {
    out.set(a, o);
    o += a.length;
  }
  return out;
};

// ------------------------------------------------------- self-validation ---
const vec = (u8) => toHex(keccak256(u8));
console.assert(
  vec(new Uint8Array(0)) ===
    '0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470',
  'keccak self-test failed (empty)',
);
console.assert(
  keccakStr('transfer(address,uint256)') === '0xa9059cbb2ab09eb219583f4a59a5d0623ade346d962bcd4e46b11da047c9049b',
  'keccak self-test failed (transfer)',
);
console.assert(
  toHex(namehash('eric.etclab.au.eth')) ===
    '0xc2f44a2a161131dbee237c03cf54865c948587c761a6f460fc3e84d4d8d073f7',
  'namehash self-test failed',
);
console.assert(
  toHex(namehash('eth')) ===
    '0x93cdeb708b7545dc668eb9280176169d1c33cfd8ed6f04690a0bcc88a93fc4ae',
  'namehash self-test failed (eth)',
);