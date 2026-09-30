export function shouldShowPercentage(current: number, previous: number): boolean {
  if (previous === 0) return false;
  return (current > 0 && previous > 0) || (current < 0 && previous < 0);
}

export function computeNetWorthDelta(current: number, previous: number) {
  const absolute = current - previous;
  const percentage = shouldShowPercentage(current, previous)
    ? ((current - previous) / Math.abs(previous)) * 100
    : null;
  return { absolute, percentage };
}

interface AccountLike {
  name: string;
  type: string;
  balance: number;
}

function signedBalance(acc: AccountLike): number {
  return acc.type === 'asset' ? acc.balance : -acc.balance;
}

export function sumNetWorth(accounts: AccountLike[]): number {
  return accounts.reduce((sum, a) => sum + signedBalance(a), 0);
}

interface ChangeFigures {
  /** Signed balance change in EUR cents (current − prior; a missing side counts as 0). */
  balanceChange: number;
  /** Signed effect on net worth in EUR cents; each side is signed by its own account type. */
  netWorthEffect: number;
  /** True when neither the balance nor net worth moved. */
  unchanged: boolean;
}

/**
 * One row of the per-account change comparison. `matched`/`new` rows carry the
 * current snapshot's account; `ghost` rows carry an account that exists only in
 * the prior snapshot (its balance is now effectively 0).
 */
export type AccountChangeRow<A> = { kind: 'matched' | 'new' | 'ghost'; account: A } & ChangeFigures;

function changeFigures(current: AccountLike | undefined, prior: AccountLike | undefined): ChangeFigures {
  const balanceChange = (current?.balance ?? 0) - (prior?.balance ?? 0);
  const netWorthEffect = (current ? signedBalance(current) : 0) - (prior ? signedBalance(prior) : 0);
  return { balanceChange, netWorthEffect, unchanged: balanceChange === 0 && netWorthEffect === 0 };
}

/**
 * Compares each account against the most recent prior snapshot, matching by exact
 * name. Returns null when there is no prior snapshot. Otherwise: the current
 * accounts in their given order, then ghost rows for prior-only accounts. The
 * net worth effects of all rows sum to the snapshot's net worth change.
 */
export function computeAccountChanges<A extends AccountLike>(
  current: A[],
  prior: A[] | null
): AccountChangeRow<A>[] | null {
  if (prior === null) return null;
  const unmatched = [...prior];
  const rows: AccountChangeRow<A>[] = current.map((account) => {
    const i = unmatched.findIndex((p) => p.name === account.name);
    const match = i === -1 ? undefined : unmatched.splice(i, 1)[0];
    return { kind: match ? 'matched' : 'new', account, ...changeFigures(account, match) };
  });
  for (const account of unmatched) {
    rows.push({ kind: 'ghost', account, ...changeFigures(undefined, account) });
  }
  return rows;
}
