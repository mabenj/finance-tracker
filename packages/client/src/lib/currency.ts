export function formatEurCents(cents: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

export function formatDeltaCents(cents: number): string {
  const sign = cents > 0 ? '+' : '';
  return sign + formatEurCents(cents);
}
