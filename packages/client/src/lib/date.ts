// Finnish date helpers. Month names are generated once via Intl so there's a
// single source of truth (no hardcoded arrays duplicated across components).

const monthFormatter = new Intl.DateTimeFormat('fi-FI', { month: 'long' });

function capitalizeFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Index 1..12 holds a month name; index 0 is empty so callers can use the
// 1-based month number directly (MONTH_NAMES[month]).
export const MONTH_NAMES: string[] = [
  '',
  ...Array.from({ length: 12 }, (_, i) =>
    capitalizeFirst(monthFormatter.format(new Date(2000, i, 1)))
  ),
];

// "Kesäkuu 2026" — used in titles, lists and dialogs.
export function formatMonthYear(year: number, month: number): string {
  return `${MONTH_NAMES[month]} ${year}`;
}
