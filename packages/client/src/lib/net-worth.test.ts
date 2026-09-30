import { describe, test, expect } from 'bun:test';
import { shouldShowPercentage, computeNetWorthDelta, sumNetWorth } from './net-worth';

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
