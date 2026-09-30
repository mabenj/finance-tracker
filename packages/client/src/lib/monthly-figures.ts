export interface Amounted {
  amount: number;
}

export interface MonthlyFigures {
  totalIncome: number;
  totalExpenses: number;
  residual: { kind: 'surplus' | 'deficit'; amount: number };
}

const sum = (items: Amounted[]) => items.reduce((total, item) => total + item.amount, 0);

// A snapshot's cash flow in EUR cents: total income, total expenses, and the
// residual as a surplus or deficit (never a negative amount).
export function computeMonthlyFigures(incomes: Amounted[], expenses: Amounted[]): MonthlyFigures {
  const totalIncome = sum(incomes);
  const totalExpenses = sum(expenses);
  const net = totalIncome - totalExpenses;
  return {
    totalIncome,
    totalExpenses,
    residual: net >= 0 ? { kind: 'surplus', amount: net } : { kind: 'deficit', amount: -net },
  };
}
