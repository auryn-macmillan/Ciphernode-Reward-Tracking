# IPP-001 · Epoch 6 Settlement Sheet

> Unofficial settlement computation for the Interfold Initial Ciphernode Rewards
> Program (IPP-001), epoch 6 of 6. Recomputed from
> Ethereum mainnet by the Ciphernode Rewards Tracker. The Foundation's published
> settlement sheet and its 48-hour dispute window govern final payouts.

- **Epoch:** 6 of 6
- **Start block:** — · 2026-10-28 03:11:47 UTC
- **End block:** — · 2026-11-11 03:11:47 UTC
- **Pool weight:** 8 (Fibonacci 1:1:2:3:5:8)
- **Pool:** 4,800,000 FOLD
- **Total ticket-blocks:** 0
- **Operators:** 0
- **Status:** upcoming

## Per-operator entitlements

Default bond-owner attribution (IPP-001 §3). Entitlement = pool × ticket-blocks ÷ total ticket-blocks.

| Operator | ENS | Credited tickets/block* | Ticket-blocks | Share | Entitlement (FOLD) |
| --- | --- | --- | --- | --- | --- |


* Average credited tickets per block over 0 observed blocks (cap 8/operator).

## Notes

- Attribution defaults to the bond owner of record per block. Foundation common-control determinations (IPP-001 §3) may merge operators; the 8-credit cap then applies to the merged group.
- Full recomputable dataset: `state.json`. Safe payout payload for this epoch: `payouts/epoch-6.safe.json`.
- Payouts are delivered as VE-locked FOLD (`createLockFor`, 30-day term) by the Foundation Safe after the 48-hour dispute window.
- Pin CIDs for this sheet and its dependencies are recorded in `pinnings.json`.
