import { sumTree } from './sum-tree';
import { t } from './strings';

export type SankeyNodeType =
  | 'income'
  | 'unspecified-income'
  | 'deficit'
  | 'budget'
  | 'expenses-total'
  | 'category'
  | 'expense'
  | 'surplus';

export interface SankeyNode {
  id: string;
  /** Bare name, no amount/percentage — the renderer composes the full label. */
  name: string;
  type: SankeyNodeType;
  /** Subtree total in EUR cents (sumTree semantics). */
  value: number;
  /** Tree depth: income=0, budget=1, expenses-total=2, surplus=2, top category=3, deeper=parent+1, expense=parentCat+1. Used to size height to the densest column. */
  depth: number;
  /** Fill/stroke color. Top-category hue propagates down its subtree. */
  color: string;
  /** Global pre-order DFS rank — drives deterministic, no-crossing column ordering. */
  rank: number;
}

export interface SankeyLink {
  source: string;
  target: string;
  value: number;
  color: string;
}

export interface SankeyGraph {
  nodes: SankeyNode[];
  links: SankeyLink[];
}

// Fixed-role colors (carried over from the previous renderer).
const NEUTRAL = '#64748b'; // income sources + budget trunk + expenses aggregate
const UNSPECIFIED = '#f59e0b';
const SURPLUS = '#22c55e';
const DEFICIT = '#ef4444';

// 8-hue categorical palette; top categories cycle through it by DFS order.
const PALETTE = [
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#f97316',
  '#14b8a6',
  '#eab308',
  '#06b6d4',
  '#a855f7',
];

type Cat = { id: number; name: string; parent_id: number | null };
type Exp = { id: number; name: string; amount: number; category_id: number };
type Inc = { id: number; name: string; amount: number };

const BUDGET = 'budget';
const EXPENSES = 'expenses';

/**
 * Build the Sankey graph for the single-trunk "Budget" model:
 *   income sources → Budget → { Expenses → categories (→ subcategories → individual expenses), Surplus }.
 *
 * Expenses and Surplus are siblings under the Budget trunk; Expenses aggregates the
 * whole category tree, Surplus is the unallocated residual (income − expenses).
 *
 * Nodes carry a global pre-order DFS `rank`; the layout sorts each column by it so
 * every subtree occupies one contiguous band and no flow lines cross.
 */
export function buildSankeyGraph(incomes: Inc[], expenses: Exp[], categories: Cat[]): SankeyGraph {
  const nodes: SankeyNode[] = [];
  const links: SankeyLink[] = [];

  // Zero-value handling: drop zero-amount incomes/expenses up front (§11).
  const incs = incomes.filter((i) => i.amount > 0);
  const exps = expenses.filter((e) => e.amount > 0);

  const totalIncome = incs.reduce((s, i) => s + i.amount, 0);
  const totalExpenses = exps.reduce((s, e) => s + e.amount, 0);

  // §3 edge-state precedence — first match wins.
  // 1. Empty
  if (totalIncome === 0 && totalExpenses === 0) {
    return { nodes: [], links: [] };
  }

  const catTotals = sumTree(categories, exps);
  const childCats = new Map<number, Cat[]>();
  for (const c of categories) {
    if (c.parent_id !== null) {
      (childCats.get(c.parent_id) ?? childCats.set(c.parent_id, []).get(c.parent_id)!).push(c);
    }
  }
  const expsByCat = new Map<number, Exp[]>();
  for (const e of exps) {
    (expsByCat.get(e.category_id) ?? expsByCat.set(e.category_id, []).get(e.category_id)!).push(e);
  }

  // value-descending, then name ascending (locale-aware), then id ascending.
  const byValueDesc = <T extends { value: number; name: string; id: number }>(a: T, b: T) =>
    b.value - a.value || a.name.localeCompare(b.name) || a.id - b.id;

  let rank = 0;

  // --- Income side (column 0), ordered value-desc; deficit/unspecified pinned bottom ---
  const isNoIncome = totalIncome === 0; // state 2
  if (isNoIncome) {
    nodes.push({ id: 'unspecified', name: t.sankeyUnspecifiedIncome, type: 'unspecified-income', value: totalExpenses, depth: 0, color: UNSPECIFIED, rank: rank++ });
    links.push({ source: 'unspecified', target: BUDGET, value: totalExpenses, color: UNSPECIFIED });
  } else {
    const sorted = [...incs]
      .map((i) => ({ id: i.id, name: i.name, value: i.amount }))
      .sort(byValueDesc);
    for (const i of sorted) {
      const id = `income-${i.id}`;
      nodes.push({ id, name: i.name, type: 'income', value: i.value, depth: 0, color: NEUTRAL, rank: rank++ });
      links.push({ source: id, target: BUDGET, value: i.value, color: NEUTRAL });
    }
  }

  // Deficit source pinned to the bottom of the income column (state 4).
  const surplus = totalIncome - totalExpenses;
  const isDeficit = !isNoIncome && surplus < 0;
  if (isDeficit) {
    nodes.push({ id: 'deficit', name: t.sankeyDeficit, type: 'deficit', value: -surplus, depth: 0, color: DEFICIT, rank: rank++ });
    links.push({ source: 'deficit', target: BUDGET, value: -surplus, color: DEFICIT });
  }

  // --- Budget trunk (column 1, alone) ---
  nodes.push({ id: BUDGET, name: t.sankeyBudget, type: 'budget', value: Math.max(totalIncome, totalExpenses), depth: 1, color: NEUTRAL, rank: rank++ });

  // --- Expenses aggregate (column 2) — sibling of Surplus under the trunk ---
  if (totalExpenses > 0) {
    nodes.push({ id: EXPENSES, name: t.expenses, type: 'expenses-total', value: totalExpenses, depth: 2, color: NEUTRAL, rank: rank++ });
    links.push({ source: BUDGET, target: EXPENSES, value: totalExpenses, color: NEUTRAL });
  }

  // --- Expense subtree, DFS from Expenses over top categories (value-desc) ---
  const topCats = categories
    .filter((c) => c.parent_id === null && (catTotals.get(c.id) ?? 0) > 0)
    .map((c) => ({ id: c.id, name: c.name, value: catTotals.get(c.id) ?? 0 }))
    .sort(byValueDesc);

  topCats.forEach((tc, idx) => {
    const groupColor = PALETTE[idx % PALETTE.length];
    links.push({ source: EXPENSES, target: `cat-${tc.id}`, value: tc.value, color: groupColor });
    visitCategory(tc.id, groupColor, 3);
  });

  // --- Surplus outflow, pinned to the bottom of Budget's outflows (state 6) ---
  if (!isNoIncome && surplus > 0) {
    nodes.push({ id: 'surplus', name: t.sankeySurplus, type: 'surplus', value: surplus, depth: 2, color: SURPLUS, rank: rank++ });
    links.push({ source: BUDGET, target: 'surplus', value: surplus, color: SURPLUS });
  }

  return { nodes, links };

  /** Pre-order DFS of one category: emit the node, then its mixed children (subcats + direct expenses) value-desc. */
  function visitCategory(catId: number, groupColor: string, depth: number) {
    const cat = categories.find((c) => c.id === catId)!;
    nodes.push({ id: `cat-${catId}`, name: cat.name, type: 'category', value: catTotals.get(catId) ?? 0, depth, color: groupColor, rank: rank++ });

    type Child =
      | { kind: 'cat'; id: number; name: string; value: number }
      | { kind: 'exp'; id: number; name: string; value: number };

    const children: Child[] = [];
    for (const sub of childCats.get(catId) ?? []) {
      const v = catTotals.get(sub.id) ?? 0;
      if (v > 0) children.push({ kind: 'cat', id: sub.id, name: sub.name, value: v });
    }
    for (const e of expsByCat.get(catId) ?? []) {
      children.push({ kind: 'exp', id: e.id, name: e.name, value: e.amount });
    }
    children.sort(byValueDesc);

    for (const ch of children) {
      if (ch.kind === 'cat') {
        links.push({ source: `cat-${catId}`, target: `cat-${ch.id}`, value: ch.value, color: groupColor });
        visitCategory(ch.id, groupColor, depth + 1);
      } else {
        const id = `exp-${ch.id}`;
        nodes.push({ id, name: ch.name, type: 'expense', value: ch.value, depth: depth + 1, color: groupColor, rank: rank++ });
        links.push({ source: `cat-${catId}`, target: id, value: ch.value, color: groupColor });
      }
    }
  }
}
