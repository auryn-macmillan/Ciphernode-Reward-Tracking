# IPP-001 · Epoch 1 Settlement Sheet

> Unofficial settlement computation for the Interfold Initial Ciphernode Rewards
> Program (IPP-001), epoch 1 of 6. Recomputed from
> Ethereum mainnet by the Ciphernode Rewards Tracker. The Foundation's published
> settlement sheet and its 48-hour dispute window govern final payouts.

- **Epoch:** 1 of 6
- **Start block:** 25786382 · 2026-08-19 03:11:47 UTC
- **End block:** 25886833 · 2026-09-02 03:11:47 UTC
- **Pool weight:** 1 (Fibonacci 1:1:2:3:5:8)
- **Pool:** 600,000 FOLD
- **Total ticket-blocks:** 1,347,668
- **Operators:** 12
- **Status:** complete

## Per-operator entitlements

Default bond-owner attribution (IPP-001 §3). Entitlement = pool × ticket-blocks ÷ total ticket-blocks.

| Operator | ENS | Credited tickets/block* | Ticket-blocks | Share | Entitlement (FOLD) |
| --- | --- | --- | --- | --- | --- |
| 0x1df428833f2c9fb1ef098754e5d710432450d706 | 0xjoshua.eth | 0 | 9,773 | 0.7200% | 4,351.0716 |
| 0x8b405dbf2f30844b608b08dad20447a6955a6c6e | — | 0 | 95,771 | 7.1000% | 42,638.543 |
| 0x291bd021638b9aef86c6d47e29cda1cf3804bafb | — | 0 | 95,531 | 7.0800% | 42,531.6917 |
| 0x8d138c01765483cb79d787ce5933f609cbfdabcf | adrianleb.eth | 0 | 83,461 | 6.1900% | 37,157.9647 |
| 0x0b304924faa64b0f040dca67bc5175dd6078db52 | — | 0 | 56,631 | 4.2000% | 25,212.8862 |
| 0x2179a7a0be3eb10c45a9aeec11f260e2bc4b1a7c | bezpok.eth | 0 | 53,931 | 4.0000% | 24,010.8097 |
| 0x2deb5ff7d2cdfa92a73f0b0b534e51875c81a5ed | — | 0 | 53,443 | 3.9600% | 23,793.5455 |
| 0x34aa3f359a9d614239015126635ce7732c18fdf3 | austingriffith.eth | 5 | 505,828 | 37.5300% | 225,201.4591 |
| 0x8dcb4a4e9621c492a82c0e3e105ab69124c401a2 | — | 0 | 31,544 | 2.3400% | 14,043.8149 |
| 0xcb6ce8c3a16def797167e8a2aed7998a065f2513 | — | 0 | 24,342 | 1.8000% | 10,837.3872 |
| 0x97843608a00e2bbc75ab0c1911387e002565dede | buidlguidl.eth | 2 | 203,105 | 15.0700% | 90,425.0898 |
| 0xbb66ff0728ec074f3e374947246e8daa7e6aa587 | — | 1 | 134,308 | 9.9600% | 59,795.736 |

* Average credited tickets per block over 100,451 observed blocks (cap 8/operator).

## Notes

- Attribution defaults to the bond owner of record per block. Foundation common-control determinations (IPP-001 §3) may merge operators; the 8-credit cap then applies to the merged group.
- Full recomputable dataset: `state.json`. Safe payout payload for this epoch: `payouts/epoch-1.safe.json`.
- Payouts are delivered as VE-locked FOLD (`createLockFor`, 30-day term) by the Foundation Safe after the 48-hour dispute window.
- Pin CIDs for this sheet and its dependencies are recorded in `pinnings.json`.
