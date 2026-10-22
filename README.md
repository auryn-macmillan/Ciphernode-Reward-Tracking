# IPP-001 Ciphernode Rewards Tracker

Static web app tracking reward accrual for the **Interfold Initial Ciphernode
Rewards Program (IPP-001)**: 12,000,000 FOLD over six biweekly epochs from the
mainnet launch block, split per epoch by Fibonacci weights (1:1:2:3:5:8) in
proportion to each **node operator's** ticket-block accrual (credited tickets ×
blocks, max 8 credits per operator).

[Live app (GitHub Pages)](https://auryn-macmillan.github.io/Ciphernode-Reward-Tracking/) ·
[Proposal text (IPFS)](https://aquamarine-added-basilisk-78.mypinata.cloud/ipfs/bafkreicnfxpcqvygwn4kmhlpmgndcavaldumzbvybtlatgahj6uwuc73xu)

## How it works

- `tools/track.mjs` — zero-dependency Node ≥18 script. Replays the Ethereum
  mainnet event log from the launch block (T0 = 25,786,382, the `Interfold`
  contract deployment) through the head block, reconstructs the per-block
  "active" state of every registered ciphernode, and computes per-operator
  ticket-block accrual and estimated payouts for each epoch. Writes
  `state.json` at the repo root.
- `index.html` / `app.js` / `styles.css` — fully static frontend that renders
  `state.json`. Styling follows the Interfold site theme tokens (`--if-*`)
  used by governance.theinterfold.com.
- `tools/ens.mjs` + `tools/crypto.mjs` — forward-confirmed ENS reverse
  resolution (self-contained keccak256/namehash, no dependencies); resolved
  names are stored in `state.json` (`ens` map + per-row `ens` fields) and
  shown in the tables.
- `tools/safe.mjs` — builds per-epoch **Safe transaction-builder payloads**
  for completed epochs into `payouts/epoch-N.safe.json`: one
  `approve(voteEscrow, total)` on FOLD followed by one
  `createLockFor(value, operator)` per recipient (IPP-001 §3 settlement).
  The format matches the Safe Transaction Builder import format, so a file
  can be uploaded directly at app.safe.global (Foundation Safe, Ethereum
  Mainnet) for review, simulation, and signing. The frontend's "Download
  Safe payload" button serves these files.
- `tools/pin.mjs` — pins the IPP-001 settlement artifacts to IPFS via
  [Pinata](https://pinata.cloud) so each epoch's 48-hour dispute sheet
  (IPP-001 §3) is immutable and citable. Per completed epoch it pins
  `payouts/epoch-N.settlement.md` (a human-readable sheet: epoch bounds,
  pool, per-operator entitlements) and the Safe payload; it also pins
  `state.json` whenever its content changes. CIDs are recorded in
  `pinnings.json`, and the frontend links each pinned sheet + the latest
  snapshot. Auth is via a GitHub secret: **`PINATA_JWT`** (a Pinata
  Developer JWT, recommended) — or, as a fallback, `PINATA_API_KEY` +
  `PINATA_API_USER` (legacy API key). Pinning is best-effort: if the secret
  is unset or Pinata errors, the run logs and continues (the state refresh
  is unaffected). See *IPFS pinning* below.
- `.github/workflows/refresh.yml` — runs `track.mjs` three times a day on a
  schedule (and on demand), commits the new `state.json` + `payouts/` +
  `pinnings.json`, pins the artifacts, and GitHub Pages serves the result.
  No server, no build step.

### "Active" predicate (per block, per node)

Registered (between `CiphernodeAdded` and `CiphernodeRemoved`) ∧
bond ≥ `requiredCiphernodeBond × ciphernodeBondActiveBps / 10000` ∧
`ticketBalance / ticketPrice ≥ minTicketBalance` ∧ not banned
(`NodeBanUpdated`). Eligibility parameters are replayed from
`ConfigurationUpdated` events, so historical blocks use the parameters that
were in force then.

### Operator attribution

The default operator identity is the **bond owner of record**, evaluated per
block from `BondOwnerSet` history (a node whose owner changed accrues to the
owner of record at each block). Foundation common-control determinations
(IPP-001 §3) merge operators on top of this default; the 8-credit cap then
applies to the merged group. Determinations are recorded in each epoch's
Foundation settlement sheet, which remains authoritative — this tracker shows
recomputable estimates under default attribution.

### Key contracts (Ethereum mainnet)

| Contract | Address |
| --- | --- |
| Interfold | `0x28cF63B459e6218C69EA97ea7D90541cf648c715` |
| CiphernodeRegistry | `0xC927A5B2d8F68697bC28C0670df05178c93df2d7` |
| BondingRegistry | `0x0ec90465095C21830BEcED07e032809A2Bd2915F` |
| SlashingManager | `0x753109Ee36Dc65cC178875AddA30C6433e5bEEe4` |
| InterfoldTicketToken (tFOLD) | `0xC0B5b49a3949eC4B520eF21BaCFE16e3695F3B5D` |

Source: [deployment manifest](https://github.com/theinterfold/interfold/blob/main/deployments/manifest.json).

## Running locally

```sh
RPC_URL=https://your-archive-rpc node tools/track.mjs
python3 -m http.server 8080   # then open http://localhost:8080
```

The RPC must be an **archive** endpoint on Ethereum mainnet (the tracker reads
blocks and logs from T0 forward). Block-boundary discovery uses a handful of
`eth_getBlockByNumber` binary searches; the rest is `eth_getLogs` — cheap
enough for a hosted free tier at the current registration volume.

## IPFS pinning

Each completed epoch's settlement sheet (the artifact IPP-001 §3 pins for its
48-hour dispute window) is pinned to IPFS so it is immutable and citable, along
with the full `state.json` snapshot. CIDs land in `pinnings.json` and the page
links them ("Snapshot (IPFS)" in the header, "Settlement sheet ↗" on each
settled epoch card).

To enable it, add a repository secret:

- **`PINATA_JWT`** *(recommended)* — a **Pinata Developer JWT (PDJ)**. Create it
  in the Pinata dashboard under *Account management → API keys → Developer
  JWTs* (grant it pinning permission). The workflow uses it as
  `Authorization: Bearer <jwt>` against Pinata's v3 upload API.
- *Or* the legacy pair **`PINATA_API_KEY`** + **`PINATA_API_USER`** (your API
  key and its account user id) — used with the v1 `pinByString` endpoint.

Pinning runs after each refresh and is **best-effort**: if the secret is unset
or Pinata is unavailable, `tools/pin.mjs` logs and exits cleanly, so the state
refresh and Pages deploy are never blocked. Re-pin behavior: `state.json` is
re-pinned only when its content changes; each epoch's sheet and Safe payload are
pinned exactly once (on the first refresh after the epoch completes).

## Deploying

1. Create the repo and push this directory to `main`.
2. Add a repository secret `RPC_URL` with an archive-node mainnet RPC URL
   (e.g. an Alchemy key with archive access).
3. *(Optional)* Add `PINATA_JWT` (or `PINATA_API_KEY` + `PINATA_API_USER`) to
   enable IPFS pinning of settlement sheets. Without it, the tracker works
   fully; only the IPFS links are omitted.
4. Settings → Pages → Source: *Deploy from a branch* → `main` / `/ (root)`.
5. The scheduled workflow refreshes `state.json` three times a day; the page
   picks it up on the next load.

## Caveats

- Estimates under **default bond-owner attribution**; the Foundation's
  per-epoch settlement sheet (with common-control determinations) is
  authoritative.
- Epoch boundaries are timestamp-driven (14 days from T0); accrual is per
  block, so in-progress epochs show partial ticket-blocks and payouts scale
  with the epoch's realized denominator.
- The tracker intentionally does not model the NodeReleaseRegistry readiness
  gate or the admission-policy waiting period from the on-chain `isActive`
  flag (both are launch-window plumbing that resolved within minutes of
  registration in practice); it implements the IPP-001 predicate directly.