import { describe, test, expect } from 'bun:test';
import { shouldShowPercentage, computeNetWorthDelta, sumNetWorth, buildAccountChartData } from './net-worth';

describe('net worth utilities', () => {
  test('shows percentage when both net worths are positive', () => {
    expect(shouldShowPercentage(200000, 100000)).toBe(true);
  });

  test('shows percentage when both net worths are negative', () => {
    expect(shouldShowPercentage(-100000, -200000)).toBe(true);
  });

  test('omits percentage when current is positive and previous is negative', () => {
    expect(shouldShowPercentage(100000, -200000)).toBe(false);
  });

  test('omits percentage when current is negative and previous is positive', () => {
    expect(shouldShowPercentage(-100000, 200000)).toBe(false);
  });

  test('omits percentage when previous net worth is zero', () => {
    expect(shouldShowPercentage(100000, 0)).toBe(false);
  });

  test('computeNetWorthDelta returns correct absolute and percentage when same sign', () => {
    const delta = computeNetWorthDelta(200000, 100000);
    expect(delta.absolute).toBe(100000);
    expect(delta.percentage).toBeCloseTo(100);
  });

  test('computeNetWorthDelta returns null percentage on sign change', () => {
    const delta = computeNetWorthDelta(100000, -200000);
    expect(delta.absolute).toBe(300000);
    expect(delta.percentage).toBeNull();
  });
});

describe('sumNetWorth', () => {
  test('sums assets as positive and liabilities as negative', () => {
    const accounts = [
      { name: 'Cash', type: 'asset', balance: 100000 },
      { name: 'Mortgage', type: 'liability', balance: 30000 },
    ];
    expect(sumNetWorth(accounts)).toBe(70000);
  });

  test('returns 0 for empty account list', () => {
    expect(sumNetWorth([])).toBe(0);
  });
});

describe('buildAccountChartData', () => {
  test('returns union of current and previous account names', () => {
    const current = [{ name: 'Cash', type: 'asset', balance: 10000 }];
    const previous = [{ name: 'Mortgage', type: 'liability', balance: 50000 }];
    const data = buildAccountChartData(current, previous);
    expect(data).toHaveLength(2);
    expect(data.map((d) => d.name)).toContain('Cash');
    expect(data.map((d) => d.name)).toContain('Mortgage');
  });

  test('fills 0 for accounts absent from one side', () => {
    const current = [{ name: 'Cash', type: 'asset', balance: 10000 }];
    const data = buildAccountChartData(current, []);
    expect(data[0].Current).toBe(10000);
    expect(data[0].Previous).toBe(0);
  });

  test('fills 0 Current for accounts only in previous', () => {
    const previous = [{ name: 'Old Account', type: 'asset', balance: 5000 }];
    const data = buildAccountChartData([], previous);
    expect(data[0].Current).toBe(0);
    expect(data[0].Previous).toBe(5000);
  });

  test('assets are positive, liabilities are negative', () => {
    const current = [
      { name: 'Cash', type: 'asset', balance: 10000 },
      { name: 'Mortgage', type: 'liability', balance: 50000 },
    ];
    const data = buildAccountChartData(current, null);
    const cash = data.find((d) => d.name === 'Cash')!;
    const mortgage = data.find((d) => d.name === 'Mortgage')!;
    expect(cash.Current).toBe(10000);
    expect(mortgage.Current).toBe(-50000);
  });

  test('all Previous values are 0 when previous is null', () => {
    const current = [{ name: 'Cash', type: 'asset', balance: 10000 }];
    const data = buildAccountChartData(current, null);
    expect(data.every((d) => d.Previous === 0)).toBe(true);
  });

  test('account present in both snapshots shows both values', () => {
    const current = [{ name: 'Cash', type: 'asset', balance: 20000 }];
    const previous = [{ name: 'Cash', type: 'asset', balance: 10000 }];
    const data = buildAccountChartData(current, previous);
    expect(data).toHaveLength(1);
    expect(data[0].Current).toBe(20000);
    expect(data[0].Previous).toBe(10000);
  });
});
