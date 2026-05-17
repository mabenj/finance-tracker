import { describe, test, expect } from 'bun:test';
import { formatEurCents } from './currency';

describe('formatEurCents', () => {
  test('formats a typical amount with thousands separator and 2 decimal places', () => {
    const expected = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(1234.56);
    expect(formatEurCents(123456)).toBe(expected);
  });

  test('formats zero as 0,00 €', () => {
    const expected = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(0);
    expect(formatEurCents(0)).toBe(expected);
  });

  test('formats 1 cent as 0,01 €', () => {
    const expected = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(0.01);
    expect(formatEurCents(1)).toBe(expected);
  });
});
