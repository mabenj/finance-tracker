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
