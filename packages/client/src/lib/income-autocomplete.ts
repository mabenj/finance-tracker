// Returns a deduplicated list of income category strings.
// Deduplication is case-insensitive; the first-encountered casing is preserved (spec §4.4).
export function getIncomeCategories(incomes: { category: string }[]): string[] {
  const seen = new Map<string, string>(); // lowercase key → original casing
  for (const { category } of incomes) {
    const key = category.toLowerCase();
    if (!seen.has(key)) {
      seen.set(key, category);
    }
  }
  return Array.from(seen.values());
}
