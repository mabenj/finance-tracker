export function formatEurCents(cents: number): string {
  return new Intl.NumberFormat('fi-FI', {
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

// ─── Signed adjustments ─────────────────────────────────────────────────────
// An adjustment is an input-time convenience: a signed whole-euro delta the user
// folds into an expense's amount ("+50" adds, "-20" subtracts). It is never
// persisted on its own — only the resulting total is stored.

// Like sanitizeEuroInput but PRESERVES a single leading minus so subtractions
// can be typed. Truncates any fraction and strips other non-digits.
// "-12,50" → "-12" | "-5" → "-5" | "5" → "5" | "-" → "-" (mid-typing) | "" → ""
export function sanitizeSignedEuroInput(raw: string): string {
  const negative = raw.trimStart().startsWith('-');
  const digits = raw.split(/[.,]/)[0].replace(/\D/g, '');
  if (digits === '') return negative ? '-' : '';
  return (negative ? '-' : '') + digits;
}

// Convert a signed whole-euro string to cents. Empty or a lone "-" → null.
// "-12" → -1200 | "12" → 1200 | "0" → 0 | "" → null | "-" → null
export function signedEurosToCents(euroStr: string): number | null {
  if (euroStr === '' || euroStr === '-') return null;
  const cents = parseInt(euroStr, 10) * 100;
  return Number.isSafeInteger(cents) ? cents : null;
}

// Fold a signed adjustment string into a current cents amount, clamped to >= 0
// (the DB enforces amount >= 0, so an overshooting subtraction lands at 0).
// Returns null when the delta is empty/invalid so callers can treat it as a no-op.
export function applyEuroAdjustment(currentCents: number, deltaStr: string): number | null {
  const delta = signedEurosToCents(deltaStr);
  if (delta === null) return null;
  return Math.max(0, currentCents + delta);
}
