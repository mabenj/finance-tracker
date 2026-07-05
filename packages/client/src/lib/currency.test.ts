import { describe, test, expect } from 'bun:test';
import {
  formatEurCents,
  centsToEuroStr,
  sanitizeEuroInput,
  eurosToCents,
  sanitizeSignedEuroInput,
  signedEurosToCents,
  applyEuroAdjustment,
} from './currency';

describe('formatEurCents', () => {
  test('formats a typical amount with thousands separator and no decimals', () => {
    const expected = new Intl.NumberFormat('fi-FI', {
      style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0,
    }).format(1235);
    expect(formatEurCents(123456)).toBe(expected); // 1234,56 € rounds to 1.235 €
  });

  test('formats zero with no decimals', () => {
    const expected = new Intl.NumberFormat('fi-FI', {
      style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0,
    }).format(0);
    expect(formatEurCents(0)).toBe(expected);
  });

  test('rounds sub-euro cents to the nearest euro (display only)', () => {
    // 1 cent → 0 €, 50 cents → 1 € (banker-free round-half-up via Intl)
    expect(formatEurCents(1)).toBe(formatEurCents(0));
    expect(formatEurCents(1267)).toBe(formatEurCents(1300));
  });
});

describe('centsToEuroStr', () => {
  test('rounds stored cents to a whole-euro string for edit prefill', () => {
    expect(centsToEuroStr(0)).toBe('0');
    expect(centsToEuroStr(1200)).toBe('12');
    expect(centsToEuroStr(1234)).toBe('12'); // 12.34 rounds down
    expect(centsToEuroStr(1267)).toBe('13'); // 12.67 rounds up
    expect(centsToEuroStr(1250)).toBe('13'); // 12.50 rounds up
  });
});

describe('sanitizeEuroInput', () => {
  test('keeps a plain integer', () => {
    expect(sanitizeEuroInput('1234')).toBe('1234');
  });
  test('truncates the fraction from a pasted decimal (comma or dot)', () => {
    expect(sanitizeEuroInput('12,50')).toBe('12');
    expect(sanitizeEuroInput('12.99')).toBe('12');
  });
  test('strips sign, letters and stray characters', () => {
    expect(sanitizeEuroInput('-5')).toBe('5');
    expect(sanitizeEuroInput('1a2b')).toBe('12');
  });
  test('empty stays empty', () => {
    expect(sanitizeEuroInput('')).toBe('');
  });
});

describe('eurosToCents', () => {
  test('multiplies a whole-euro string by 100', () => {
    expect(eurosToCents('0')).toBe(0);
    expect(eurosToCents('12')).toBe(1200);
    expect(eurosToCents('1234')).toBe(123400);
  });
  test('returns null for empty or non-numeric input', () => {
    expect(eurosToCents('')).toBeNull();
    expect(eurosToCents('abc')).toBeNull();
  });
  test('returns null when the value exceeds safe-integer precision', () => {
    expect(eurosToCents('999999999999999')).toBeNull();
  });
});

describe('sanitizeSignedEuroInput', () => {
  test('keeps a plain positive integer', () => {
    expect(sanitizeSignedEuroInput('50')).toBe('50');
  });
  test('preserves a single leading minus for subtraction', () => {
    expect(sanitizeSignedEuroInput('-20')).toBe('-20');
  });
  test('truncates the fraction, keeping the sign', () => {
    expect(sanitizeSignedEuroInput('-12,50')).toBe('-12');
    expect(sanitizeSignedEuroInput('12.99')).toBe('12');
  });
  test('allows a lone minus mid-typing', () => {
    expect(sanitizeSignedEuroInput('-')).toBe('-');
  });
  test('strips a trailing/interior minus and stray characters', () => {
    expect(sanitizeSignedEuroInput('1a2b')).toBe('12');
    expect(sanitizeSignedEuroInput('5-')).toBe('5');
  });
  test('empty stays empty', () => {
    expect(sanitizeSignedEuroInput('')).toBe('');
  });
});

describe('signedEurosToCents', () => {
  test('converts positive and negative whole euros to cents', () => {
    expect(signedEurosToCents('50')).toBe(5000);
    expect(signedEurosToCents('-20')).toBe(-2000);
    expect(signedEurosToCents('0')).toBe(0);
  });
  test('returns null for empty input or a lone minus', () => {
    expect(signedEurosToCents('')).toBeNull();
    expect(signedEurosToCents('-')).toBeNull();
  });
});

describe('applyEuroAdjustment', () => {
  test('adds a positive delta to the current amount', () => {
    expect(applyEuroAdjustment(12000, '50')).toBe(17000); // 120 € + 50 € = 170 €
  });
  test('subtracts a negative delta', () => {
    expect(applyEuroAdjustment(17000, '-20')).toBe(15000); // 170 € − 20 € = 150 €
  });
  test('clamps an overshooting subtraction to zero', () => {
    expect(applyEuroAdjustment(17000, '-200')).toBe(0); // 170 € − 200 € → 0 €
  });
  test('subtracting exactly to zero is allowed', () => {
    expect(applyEuroAdjustment(17000, '-170')).toBe(0);
  });
  test('returns null for an empty or incomplete delta (no-op)', () => {
    expect(applyEuroAdjustment(12000, '')).toBeNull();
    expect(applyEuroAdjustment(12000, '-')).toBeNull();
  });
});
