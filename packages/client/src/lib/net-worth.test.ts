import { describe, test, expect } from 'bun:test';
import { shouldShowPercentage, computeNetWorthDelta, sumNetWorth, computeAccountChanges } from './net-worth';

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

describe('computeAccountChanges', () => {
  const asset = (name: string, balance: number) => ({ name, type: 'asset', balance });
  const liability = (name: string, balance: number) => ({ name, type: 'liability', balance });

  test('returns no comparison when there is no prior snapshot', () => {
    expect(computeAccountChanges([asset('Käyttötili', 100000)], null)).toBeNull();
  });

  test('a matched asset that rose or fell moves net worth the same way', () => {
    const rows = computeAccountChanges(
      [asset('Käyttötili', 131200), asset('Osakkeet', 450000)],
      [asset('Käyttötili', 100000), asset('Osakkeet', 500000)]
    );
    expect(rows).toEqual([
      expect.objectContaining({ kind: 'matched', balanceChange: 31200, netWorthEffect: 31200 }),
      expect.objectContaining({ kind: 'matched', balanceChange: -50000, netWorthEffect: -50000 }),
    ]);
  });

  test('a matched liability that fell improves net worth; one that rose worsens it', () => {
    const rows = computeAccountChanges(
      [liability('Asuntolaina', 7950000), liability('Luottokortti', 60000)],
      [liability('Asuntolaina', 8000000), liability('Luottokortti', 40000)]
    );
    expect(rows).toEqual([
      expect.objectContaining({ kind: 'matched', balanceChange: -50000, netWorthEffect: 50000 }),
      expect.objectContaining({ kind: 'matched', balanceChange: 20000, netWorthEffect: -20000 }),
    ]);
  });

  test('an account whose balance did not move is marked unchanged', () => {
    const rows = computeAccountChanges(
      [asset('Säästötili', 500000), asset('Käyttötili', 131200)],
      [asset('Säästötili', 500000), asset('Käyttötili', 100000)]
    );
    expect(rows).toEqual([
      expect.objectContaining({ kind: 'matched', balanceChange: 0, netWorthEffect: 0, unchanged: true }),
      expect.objectContaining({ kind: 'matched', unchanged: false }),
    ]);
  });

  test('a new account shows its full balance as the change', () => {
    const rows = computeAccountChanges(
      [asset('Käyttötili', 100000), asset('Uusi säästötili', 200000), liability('Autolaina', 1500000)],
      [asset('Käyttötili', 100000)]
    );
    expect(rows).toEqual([
      expect.objectContaining({ kind: 'matched' }),
      expect.objectContaining({ kind: 'new', balanceChange: 200000, netWorthEffect: 200000, unchanged: false }),
      expect.objectContaining({ kind: 'new', balanceChange: 1500000, netWorthEffect: -1500000, unchanged: false }),
    ]);
  });

  test('an account only in the prior snapshot becomes a departed row after the current accounts', () => {
    const closedSavings = asset('Vanha säästötili', 120000);
    const paidOffLoan = liability('Kulutusluotto', 300000);
    const rows = computeAccountChanges(
      [asset('Käyttötili', 100000)],
      [closedSavings, asset('Käyttötili', 100000), paidOffLoan]
    );
    expect(rows).toEqual([
      expect.objectContaining({ kind: 'matched', account: expect.objectContaining({ name: 'Käyttötili' }) }),
      { kind: 'departed', account: closedSavings, balanceChange: -120000, netWorthEffect: -120000, unchanged: false },
      { kind: 'departed', account: paidOffLoan, balanceChange: -300000, netWorthEffect: 300000, unchanged: false },
    ]);
  });

  test('a renamed account appears as one new row plus one departed row', () => {
    const rows = computeAccountChanges([asset('Säästötili (OP)', 500000)], [asset('Säästötili', 500000)]);
    expect(rows).toEqual([
      expect.objectContaining({ kind: 'new', account: expect.objectContaining({ name: 'Säästötili (OP)' }), balanceChange: 500000 }),
      expect.objectContaining({ kind: 'departed', account: expect.objectContaining({ name: 'Säästötili' }), balanceChange: -500000 }),
    ]);
  });

  test('keeps current accounts in their given order, then departed accounts in prior order', () => {
    const rows = computeAccountChanges(
      [asset('C', 1), asset('A', 1), asset('New', 1), asset('B', 1)],
      [asset('A', 1), asset('Gone 1', 1), asset('B', 1), asset('Gone 2', 1), asset('C', 1)]
    );
    expect(rows!.map((r) => [r.kind, r.account.name])).toEqual([
      ['matched', 'C'],
      ['matched', 'A'],
      ['new', 'New'],
      ['matched', 'B'],
      ['departed', 'Gone 1'],
      ['departed', 'Gone 2'],
    ]);
  });

  test('an account whose type changed signs each side by its own type', () => {
    // Was a €1 000 asset, now recorded as a €1 200 liability: net worth went 1 000 → −1 200.
    const rows = computeAccountChanges([liability('Tili', 120000)], [asset('Tili', 100000)]);
    expect(rows).toEqual([
      expect.objectContaining({ kind: 'matched', balanceChange: 20000, netWorthEffect: -220000, unchanged: false }),
    ]);
  });

  test('a type change with an equal balance still counts as a change', () => {
    const rows = computeAccountChanges([liability('Tili', 100000)], [asset('Tili', 100000)]);
    expect(rows).toEqual([
      expect.objectContaining({ balanceChange: 0, netWorthEffect: -200000, unchanged: false }),
    ]);
  });

  test('accounts sharing a name are matched one-to-one', () => {
    const rows = computeAccountChanges(
      [asset('Tili', 300), asset('Tili', 400)],
      [asset('Tili', 100), asset('Tili', 200), asset('Tili', 50)]
    );
    expect(rows!.map((r) => [r.kind, r.balanceChange])).toEqual([
      ['matched', 200],
      ['matched', 200],
      ['departed', -50],
    ]);
  });

  test('net worth effects across all rows sum to the headline net worth change', () => {
    const prior = [
      asset('Käyttötili', 100000),
      asset('Säästötili', 500000),
      liability('Asuntolaina', 8000000),
      asset('Suljettu tili', 120000),
      liability('Kulutusluotto', 300000),
      asset('Vaihtuva', 50000),
      asset('Vanha nimi', 70000),
    ];
    const current = [
      asset('Käyttötili', 131200),
      asset('Säästötili', 500000),
      liability('Asuntolaina', 7950000),
      asset('Uusi säästötili', 200000),
      liability('Autolaina', 1500000),
      liability('Vaihtuva', 60000),
      asset('Uusi nimi', 70000),
    ];
    const rows = computeAccountChanges(current, prior)!;
    const total = rows.reduce((sum, r) => sum + r.netWorthEffect, 0);
    // Prior net worth: 100000+500000−8000000+120000−300000+50000+70000 = −7 460 000
    // Current net worth: 131200+500000−7950000+200000−1500000−60000+70000 = −8 608 800
    expect(total).toBe(-1148800);
    expect(total).toBe(computeNetWorthDelta(sumNetWorth(current), sumNetWorth(prior)).absolute);
  });
});
