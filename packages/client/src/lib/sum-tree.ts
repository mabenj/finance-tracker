export function sumTree(
  categories: Array<{ id: number; parent_id: number | null }>,
  expenses: Array<{ category_id: number; amount: number }>
): Map<number, number> {
  const direct = new Map<number, number>();
  for (const c of categories) direct.set(c.id, 0);
  for (const e of expenses) {
    if (direct.has(e.category_id)) {
      direct.set(e.category_id, direct.get(e.category_id)! + e.amount);
    }
  }

  const children = new Map<number, number[]>();
  for (const c of categories) children.set(c.id, []);
  for (const c of categories) {
    if (c.parent_id !== null) {
      children.get(c.parent_id)?.push(c.id);
    }
  }

  const total = new Map<number, number>();
  const visiting = new Set<number>();

  function dfs(id: number): number {
    if (total.has(id)) return total.get(id)!;
    if (visiting.has(id)) return 0; // cycle detected — contribute 0 to break it
    visiting.add(id);
    let sum = direct.get(id) ?? 0;
    for (const childId of children.get(id) ?? []) {
      sum += dfs(childId);
    }
    visiting.delete(id);
    total.set(id, sum);
    return sum;
  }

  for (const c of categories) {
    if (!total.has(c.id)) dfs(c.id);
  }

  return total;
}
