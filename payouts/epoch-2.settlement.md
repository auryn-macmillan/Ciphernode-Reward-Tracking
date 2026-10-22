# IPP-001 · Epoch 2 Settlement Sheet

> Unofficial settlement computation for the Interfold Initial Ciphernode Rewards
> Program (IPP-001), epoch 2 of 6. Recomputed from
> Ethereum mainnet by the Ciphernode Rewards Tracker. The Foundation's published
> settlement sheet and its 48-hour dispute window govern final payouts.

- **Epoch:** 2 of 6
- **Start block:** 25886833 · 2026-09-02 03:11:47 UTC
- **End block:** 25987264 · 2026-09-16 03:11:47 UTC
- **Pool weight:** 1 (Fibonacci 1:1:2:3:5:8)
- **Pool:** 600,000 FOLD
- **Total ticket-blocks:** 3,825,169
- **Operators:** 20
- **Status:** complete

## Per-operator entitlements

Default bond-owner attribution (IPP-001 §3). Entitlement = pool × ticket-blocks ÷ total ticket-blocks.

| Operator | ENS | Credited tickets/block* | Ticket-blocks | Share | Entitlement (FOLD) |
| --- | --- | --- | --- | --- | --- |
| 0x155583c5a945b410f66f3ab0b9e334606c6e8390 | — | 0 | 97,853 | 2.5500% | 15,348.812 |
| 0xe603c63ee0e97da5a833b7498c366e88b9a5ebfe | — | 0 | 665 | 0.0100% | 104.3091 |
| 0x3794ab82cd6512d289b0d8d6787ef209cdbfddbb | — | 0 | 63,631 | 1.6600% | 9,980.8923 |
| 0x34aa3f359a9d614239015126635ce7732c18fdf3 | austingriffith.eth | 6 | 602,586 | 15.7500% | 94,519.1179 |
| 0x59461947ec279863138fae477c35b0c551a5c3a6 | — | 0 | 51,892 | 1.3500% | 8,139.5619 |
| 0xa9499065732d4319f732f8f60f8e2632904b5dc9 | — | 4 | 496,688 | 12.9800% | 77,908.4009 |
| 0x81a196af5cb4b16743e70c6122871b60511b2911 | — | 4 | 457,560 | 11.9600% | 71,770.9465 |
| 0x97843608a00e2bbc75ab0c1911387e002565dede | buidlguidl.eth | 4 | 434,453 | 11.3500% | 68,146.4792 |
| 0xcb6ce8c3a16def797167e8a2aed7998a065f2513 | — | 3 | 382,623 | 10.0000% | 60,016.6424 |
| 0xc6e48712e56f6e9548c54a0a983ebe992efa26bd | — | 0 | 3,185 | 0.0800% | 499.5857 |
| 0x0b304924faa64b0f040dca67bc5175dd6078db52 | — | 3 | 301,293 | 7.8700% | 47,259.5589 |
| 0x8dcb4a4e9621c492a82c0e3e105ab69124c401a2 | — | 2 | 200,862 | 5.2500% | 31,506.3726 |
| 0xbb66ff0728ec074f3e374947246e8daa7e6aa587 | — | 2 | 200,862 | 5.2500% | 31,506.3726 |
| 0x2179a7a0be3eb10c45a9aeec11f260e2bc4b1a7c | bezpok.eth | 0 | 18,397 | 0.4800% | 2,885.6764 |
| 0x8577fbe7bb7a2c1ca7616d50e9ade57ebebd8e79 | tomteilors.eth | 0 | 10,464 | 0.2700% | 1,641.3392 |
| 0x1df428833f2c9fb1ef098754e5d710432450d706 | 0xjoshua.eth | 1 | 100,431 | 2.6200% | 15,753.1863 |
| 0x2deb5ff7d2cdfa92a73f0b0b534e51875c81a5ed | — | 1 | 100,431 | 2.6200% | 15,753.1863 |
| 0x8d138c01765483cb79d787ce5933f609cbfdabcf | adrianleb.eth | 1 | 100,431 | 2.6200% | 15,753.1863 |
| 0x291bd021638b9aef86c6d47e29cda1cf3804bafb | — | 1 | 100,431 | 2.6200% | 15,753.1863 |
| 0x8b405dbf2f30844b608b08dad20447a6955a6c6e | — | 1 | 100,431 | 2.6200% | 15,753.1863 |

* Average credited tickets per block over 100,431 observed blocks (cap 8/operator).

## Notes

- Attribution defaults to the bond owner of record per block. Foundation common-control determinations (IPP-001 §3) may merge operators; the 8-credit cap then applies to the merged group.
- Full recomputable dataset: `state.json`. Safe payout payload for this epoch: `payouts/epoch-2.safe.json`.
- Payouts are delivered as VE-locked FOLD (`createLockFor`, 30-day term) by the Foundation Safe after the 48-hour dispute window.
- Pin CIDs for this sheet and its dependencies are recorded in `pinnings.json`.
