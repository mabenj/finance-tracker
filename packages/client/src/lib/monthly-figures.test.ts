import { describe, test, expect } from 'bun:test';
import { computeMonthlyFigures } from './monthly-figures';

describe('computeMonthlyFigures', () => {
  test('surplus month: income exceeds expenses', () => {
    const incomes = [{ amount: 350000 }, { amount: 70000 }]; // €4,200
    const expenses = [{ amount: 200000 }, { amount: 110000 }]; // €3,100

    expect(computeMonthlyFigures(incomes, expenses)).toEqual({
      totalIncome: 420000,
      totalExpenses: 310000,
      residual: { kind: 'surplus', amount: 110000 },
    });
  });

  test('deficit month: shortfall is reported as a positive deficit', () => {
    const incomes = [{ amount: 280000 }]; // €2,800
    const expenses = [{ amount: 250000 }, { amount: 60000 }]; // €3,100

    expect(computeMonthlyFigures(incomes, expenses)).toEqual({
      totalIncome: 280000,
      totalExpenses: 310000,
      residual: { kind: 'deficit', amount: 30000 },
    });
  });

  test('equal totals: surplus of 0', () => {
    const incomes = [{ amount: 150000 }];
    const expenses = [{ amount: 100000 }, { amount: 50000 }];

    expect(computeMonthlyFigures(incomes, expenses)).toEqual({
      totalIncome: 150000,
      totalExpenses: 150000,
      residual: { kind: 'surplus', amount: 0 },
    });
  });

  test('no income with expenses: deficit equals the expenses', () => {
    const expenses = [{ amount: 45000 }, { amount: 5000 }];

    expect(computeMonthlyFigures([], expenses)).toEqual({
      totalIncome: 0,
      totalExpenses: 50000,
      residual: { kind: 'deficit', amount: 50000 },
    });
  });

  test('empty inputs: everything is 0', () => {
    expect(computeMonthlyFigures([], [])).toEqual({
      totalIncome: 0,
      totalExpenses: 0,
      residual: { kind: 'surplus', amount: 0 },
    });
  });
});
