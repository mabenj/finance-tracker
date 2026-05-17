import { describe, test, expect } from 'bun:test';
import { sumTree } from './sum-tree';

describe('sumTree', () => {
  test('leaf category returns its own direct expenses only', () => {
    const categories = [{ id: 1, parent_id: null }];
    const expenses = [
      { category_id: 1, amount: 1000 },
      { category_id: 1, amount: 2000 },
    ];
    const totals = sumTree(categories, expenses);
    expect(totals.get(1)).toBe(3000);
  });

  test('parent category includes all descendant expenses', () => {
    const categories = [
      { id: 1, parent_id: null },
      { id: 2, parent_id: 1 },
    ];
    const expenses = [
      { category_id: 1, amount: 1000 },
      { category_id: 2, amount: 2000 },
    ];
    const totals = sumTree(categories, expenses);
    expect(totals.get(1)).toBe(3000);
    expect(totals.get(2)).toBe(2000);
  });

  test('category with no expenses returns 0', () => {
    const categories = [{ id: 1, parent_id: null }];
    const totals = sumTree(categories, []);
    expect(totals.get(1)).toBe(0);
  });

  test('three levels of nesting roll up correctly', () => {
    const categories = [
      { id: 1, parent_id: null },
      { id: 2, parent_id: 1 },
      { id: 3, parent_id: 2 },
    ];
    const expenses = [{ category_id: 3, amount: 500 }];
    const totals = sumTree(categories, expenses);
    expect(totals.get(3)).toBe(500);
    expect(totals.get(2)).toBe(500);
    expect(totals.get(1)).toBe(500);
  });

  test('multiple branches roll up independently and together', () => {
    const categories = [
      { id: 1, parent_id: null },
      { id: 2, parent_id: 1 },
      { id: 3, parent_id: 1 },
    ];
    const expenses = [
      { category_id: 2, amount: 300 },
      { category_id: 3, amount: 700 },
    ];
    const totals = sumTree(categories, expenses);
    expect(totals.get(2)).toBe(300);
    expect(totals.get(3)).toBe(700);
    expect(totals.get(1)).toBe(1000);
  });

  test('empty categories and expenses returns empty map', () => {
    const totals = sumTree([], []);
    expect(totals.size).toBe(0);
  });
});
