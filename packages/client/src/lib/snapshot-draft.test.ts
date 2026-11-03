import { describe, test, expect } from 'bun:test';
import {
  defaultNewMonth, draftProblems, draftTotals, itemsOf, precedingSnapshot, phaseProgress, pruneCategories, seedDraft, sortedCategories,
  type SourceSnapshot,
} from './snapshot-draft';

const prev: SourceSnapshot = {
  accounts: [
    { name: 'Käyttötili', type: 'asset', category: 'käteinen', balance: 100000, total_paid: null },
    { name: 'Asuntolaina', type: 'liability', category: 'laina', balance: 500000, total_paid: 20000 },
  ],
  incomes: [
    { name: 'Palkka', amount: 300000, category: 'palkka', recurrence: 'variable' },
    { name: 'Vuokra', amount: 50000, category: 'muu', recurrence: 'fixed' },
    { name: 'Veronpalautus', amount: 40000, category: 'muu', recurrence: 'none' },
  ],
  categories: [
    { id: 1, name: 'Asuminen', parent_id: null, position: 0 },
    { id: 2, name: 'Sähkö', parent_id: 1, position: 0 },
    { id: 3, name: 'Ostokset', parent_id: null, position: 1 },
    { id: 4, name: 'Ruoka', parent_id: null, position: 2 },
  ],
  expenses: [
    { name: 'Ruokakauppa', amount: 30000, category_id: 4, recurrence: 'variable' },
    { name: 'Käyttö', amount: 4000, category_id: 2, recurrence: 'variable' },
    { name: 'Vastike', amount: 40000, category_id: 1, recurrence: 'fixed' },
    { name: 'Taksi', amount: 1500, category_id: 3, recurrence: 'none' },
  ],
};

describe('seedDraft', () => {
  const d = seedDraft(2026, 11, prev);

  test('carries every account, blank, with last month as reference', () => {
    const accounts = itemsOf(d, 'accounts');
    expect(accounts.map((a) => a.name)).toEqual(['Käyttötili', 'Asuntolaina']);
    expect(accounts.every((a) => a.value === null)).toBe(true);
    expect(accounts[1]).toMatchObject({ type: 'liability', prev: 500000, totalPaid: 20000, prevTotalPaid: 20000 });
  });

  test('carries only recurring incomes: fixed prefilled, variable blank', () => {
    const incomes = itemsOf(d, 'incomes');
    expect(incomes.map((i) => [i.name, i.value, i.prev])).toEqual([
      ['Palkka', null, 300000],
      ['Vuokra', 50000, 50000],
    ]);
  });

  test('prunes categories to recurring branches, keeping ancestors', () => {
    expect(sortedCategories(d.categories).map((c) => c.path)).toEqual(['Asuminen', 'Asuminen › Sähkö', 'Ruoka']);
  });

  test('orders recurring expenses by category tree', () => {
    expect(itemsOf(d, 'expenses').map((e) => [e.name, e.value])).toEqual([
      ['Vastike', 40000],
      ['Käyttö', null],
      ['Ruokakauppa', null],
    ]);
  });

  test('totals use last month for untouched accounts and 0 for blank flows', () => {
    const t = draftTotals(d);
    expect(t.netWorth).toBe(100000 - 500000);
    expect(t.netWorthDelta).toBe(0);
    expect(t.income).toBe(50000);
    expect(t.expenses).toBe(40000);
    expect(phaseProgress(d, 'incomes')).toEqual({ filled: 1, total: 2 });
  });

  test('no previous snapshot gives an empty draft', () => {
    expect(seedDraft(2026, 1, null)).toEqual({ year: 2026, month: 1, items: [], categories: [], prevNetWorth: null });
  });
});

describe('pruneCategories', () => {
  test('a category holding only one-off expenses is dropped', () => {
    expect(pruneCategories(prev.categories, prev.expenses).map((c) => c.id)).toEqual([1, 2, 4]);
  });
});

describe('draftProblems', () => {
  test('flags blank names, blank text categories and missing expense categories', () => {
    const d = seedDraft(2026, 11, prev);
    d.items[0].name = '  ';
    d.items[1].category = '';
    itemsOf(d, 'expenses')[0].categoryId = 999;
    expect(draftProblems(d).map((p) => [p.item.name, p.problem])).toEqual([
      ['  ', 'name'],
      ['Asuntolaina', 'category'],
      ['Vastike', 'category'],
    ]);
  });

  test('a freshly seeded draft has no problems', () => {
    expect(draftProblems(seedDraft(2026, 11, prev))).toEqual([]);
  });
});

describe('month choice', () => {
  const snaps = [{ id: 1, year: 2026, month: 9 }, { id: 2, year: 2026, month: 12 }, { id: 3, year: 2026, month: 3 }];

  test('defaults to the month after the latest snapshot, rolling over the year', () => {
    expect(defaultNewMonth(snaps)).toEqual({ year: 2027, month: 1 });
  });

  test('defaults to the current month when there are no snapshots', () => {
    expect(defaultNewMonth([], new Date(2026, 10, 3))).toEqual({ year: 2026, month: 11 });
  });

  test('finds the snapshot carry-forward copies from', () => {
    expect(precedingSnapshot(snaps, { year: 2026, month: 10 })?.id).toBe(1);
    expect(precedingSnapshot(snaps, { year: 2026, month: 3 })).toBeNull();
  });
});
