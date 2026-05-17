import { describe, test, expect } from 'bun:test';
import { getIncomeCategories } from './income-autocomplete';

describe('getIncomeCategories', () => {
  test('deduplicates case-insensitively and preserves first-occurrence casing', () => {
    const incomes = [
      { category: 'Salary' },
      { category: 'salary' },
      { category: 'SALARY' },
      { category: 'Bonus' },
    ];
    const result = getIncomeCategories(incomes);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe('Salary');
    expect(result[1]).toBe('Bonus');
  });

  test('returns empty array for empty input', () => {
    expect(getIncomeCategories([])).toHaveLength(0);
  });

  test('returns a single entry when all incomes share the same category (case-insensitive)', () => {
    const incomes = [{ category: 'Employment' }, { category: 'employment' }];
    const result = getIncomeCategories(incomes);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe('Employment');
  });
});
