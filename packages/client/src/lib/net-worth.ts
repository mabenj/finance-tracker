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

// Builds Recharts-ready data for the per-account comparison chart.
// Returns the union of account names from both snapshots; accounts absent
// from one side get 0. Assets are positive, liabilities are negative (§7.1).
export function buildAccountChartData(
  current: AccountLike[],
  previous: AccountLike[] | null
): { name: string; Current: number; Previous: number }[] {
  const allNames = [
    ...new Set([
      ...current.map((a) => a.name),
      ...(previous ?? []).map((a) => a.name),
    ]),
  ];
  const currentByName = new Map(current.map((a) => [a.name, signedBalance(a)]));
  const prevByName = previous
    ? new Map(previous.map((a) => [a.name, signedBalance(a)]))
    : new Map<string, number>();
  return allNames.map((name) => ({
    name,
    Current: currentByName.get(name) ?? 0,
    Previous: prevByName.get(name) ?? 0,
  }));
}
