/**
 * Safe transaction payload generation for IPP-001 epoch settlements.
 *
 * Each epoch's payout is delivered as VE-locked FOLD: the Foundation Safe calls
 * `createLockFor(value, to)` on the Vote Escrow once per recipient (IPP-001 §3).
 * The escrow pulls FOLD from the Safe via transferFrom, so the batch is led by
 * one `approve(voteEscrow, total)` on the FOLD token (current allowance is 0).
 *
 * Output format is the Safe Transaction Builder v2 export/import format
 * (same shape as the governance repo's own safe-actions/*.json), so a file
 * produced here can be uploaded directly at
 * https://safe.global/transaction-builder (chain: Ethereum Mainnet,
 * Safe: the Foundation Safe) for review, simulation, and signing.
 */
import { selector, padAddr, padInt } from './crypto.mjs';

const SEL_APPROVE = selector('approve(address,uint256)');
const SEL_CREATE_LOCK_FOR = selector('createLockFor(uint256,address)');

const approveCall = (token, spender, amount) => ({
  to: token,
  value: '0',
  operation: 0,
  data: SEL_APPROVE + padAddr(spender) + padInt(amount),
});

const createLockForCall = (escrow, value, to) => ({
  to: escrow,
  value: '0',
  operation: 0,
  data: SEL_CREATE_LOCK_FOR + padInt(value) + padAddr(to),
});

const fmtFold = (wei) => {
  const w = BigInt(wei);
  const whole = w / 10n ** 18n;
  const frac = (w % 10n ** 18n).toString().padStart(18, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : `${whole}`;
};

/**
 * Build the Safe tx-builder payload for one epoch.
 * `operators`: [{ operator, ens, estPayoutWei }] — recipients with non-zero payout.
 */
export function buildEpochPayload({
  epochIndex,
  poolWei,
  operators,
  ens,
  contracts,
  generatedAt,
}) {
  const recipients = operators
    .filter((o) => BigInt(o.estPayoutWei) > 0n)
    .map((o) => ({ ...o, wei: BigInt(o.estPayoutWei) }));
  const total = recipients.reduce((s, o) => s + o.wei, 0n);
  const label = (o) => (ens[o.operator] ? `${ens[o.operator]} (${o.operator})` : o.operator);

  const transactions = [
    approveCall(contracts.foldToken, contracts.voteEscrow, total),
    ...recipients.map((o) =>
      createLockForCall(contracts.voteEscrow, o.wei, o.operator),
    ),
  ];

  return {
    version: '1.0',
    chainId: '1',
    createdAt: new Date(generatedAt).getTime(),
    meta: {
      name: `IPP-001 Epoch ${epochIndex} ciphernode rewards — VE-lock ${fmtFold(total)} FOLD to ${recipients.length} operators`,
      description:
        `Settlement of IPP-001 epoch ${epochIndex} (pool ${fmtFold(poolWei)} FOLD). ` +
        `Call 1 approves the Vote Escrow to pull the total; calls 2..${transactions.length} ` +
        `createLockFor() each operator's payout as a 30-day VE-locked FOLD lock (minted to the ` +
        `operator; voting power delegates to them). Recipients (default bond-owner attribution; ` +
        `check the epoch settlement sheet and any common-control determinations before executing): ` +
        recipients.map((o) => `${label(o)} = ${fmtFold(o.wei)} FOLD`).join('; '),
      txBuilderVersion: '1.18.0',
      createdFromSafeAddress: contracts.foundationSafe,
    },
    transactions,
  };
}