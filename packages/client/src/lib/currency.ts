export function formatEurCents(cents: number): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function formatDeltaCents(cents: number): string {
  const sign = cents > 0 ? '+' : '';
  return sign + formatEurCents(cents);
}

// Prefill an edit input from stored cents — ROUNDS to nearest euro
// so "what I see is what I save" (the read-only row is rendered rounded too).
export function centsToEuroStr(cents: number): string {
  return Math.round(cents / 100).toString();
}

// Sanitize raw input/paste to an integer-euro string — TRUNCATES the fraction
// and strips sign/letters. "12,50" → "12" | "12.99" → "12" | "-5" → "5" | "" → ""
export function sanitizeEuroInput(raw: string): string {
  return raw.split(/[.,]/)[0].replace(/\D/g, '');
}

// Convert a sanitized euro string to cents for saving. Empty/invalid → null.
export function eurosToCents(euroStr: string): number | null {
  if (euroStr === '') return null;
  const cents = parseInt(euroStr, 10) * 100;
  // Reject NaN and values that have lost integer precision (absurdly long input).
  return Number.isSafeInteger(cents) ? cents : null;
}
