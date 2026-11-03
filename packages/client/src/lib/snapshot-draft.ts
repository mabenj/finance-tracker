// The in-memory draft behind the new-snapshot wizard. It is seeded from the
// snapshot preceding the target month by mirroring server carry-forward
// (packages/server/src/services/carry-forward.ts), so the wizard shows exactly
// what the server will copy. Nothing is persisted until `commitDraft` runs.
import type { Recurrence } from '../components/snapshot/RecurrenceControl';
import { sumNetWorth } from './net-worth';

export type Phase = 'accounts' | 'incomes' | 'expenses';
export type AccountType = 'asset' | 'liability';

export interface DraftItem {
  key: string;
  phase: Phase;
  name: string;
  /** Last month's cents; null for rows added in the wizard. */
  prev: number | null;
  /** This month's cents; null = not entered yet. */
  value: number | null;
  /** Always 'none' for accounts. */
  recurrence: Recurrence;
  /**
   * Identifies the row carry-forward will create for this item, so the commit
   * can update it instead of duplicating it. Null for rows added in the wizard.
   */
  carryKey: string | null;
  type?: AccountType;
  /** Free-text category of an account or income. */
  category?: string;
  /** Expense category; negative ids are categories created in the wizard. */
  categoryId?: number;
  /** Liabilities: cumulative amount paid off; null = not tracked. */
  totalPaid?: number | null;
  prevTotalPaid?: number | null;
}

export interface DraftCategory {
  id: number;
  name: string;
  parent_id: number | null;
  position: number;
}

export interface Draft {
  year: number;
  month: number;
  items: DraftItem[];
  categories: DraftCategory[];
  prevNetWorth: number | null;
}

export interface SourceAccount {
  name: string;
  type: string;
  category: string;
  balance: number;
  total_paid: number | null;
}
export interface SourceIncome {
  name: string;
  amount: number;
  category: string;
  recurrence: Recurrence;
}
export interface SourceExpense {
  name: string;
  amount: number;
  category_id: number;
  recurrence: Recurrence;
}

/** A snapshot as returned by `snapshots.get`, rows already in display order. */
export interface SourceSnapshot {
  accounts: SourceAccount[];
  incomes: SourceIncome[];
  categories: DraftCategory[];
  expenses: SourceExpense[];
}

let keySeq = 0;
const nextKey = () => `d${++keySeq}`;

// ── Categories ──────────────────────────────────────────────────────────────

export type PathedCategory = DraftCategory & { path: string; depth: number };

const PATH_SEP = ' › ';

/** Depth-first, position-ordered categories with breadcrumb paths. Parents precede children. */
export function sortedCategories(categories: DraftCategory[]): PathedCategory[] {
  const out: PathedCategory[] = [];
  const walk = (parent: number | null, path: string[], depth: number) => {
    categories
      .filter((c) => c.parent_id === parent)
      .sort((a, b) => a.position - b.position || a.id - b.id)
      .forEach((c) => {
        const p = [...path, c.name];
        out.push({ ...c, path: p.join(PATH_SEP), depth });
        walk(c.id, p, depth + 1);
      });
  };
  walk(null, [], 0);
  return out;
}

export function categoryPath(categories: DraftCategory[], id: number | undefined): string | null {
  return sortedCategories(categories).find((c) => c.id === id)?.path ?? null;
}

/** Carry-forward's rule: keep a category iff it or a descendant holds a recurring expense. */
export function pruneCategories(categories: DraftCategory[], expenses: SourceExpense[]): DraftCategory[] {
  const parentOf = new Map(categories.map((c) => [c.id, c.parent_id]));
  const keep = new Set<number>();
  for (const e of expenses) {
    if (e.recurrence === 'none') continue;
    for (let cur: number | null = e.category_id; cur !== null && !keep.has(cur); cur = parentOf.get(cur) ?? null) {
      keep.add(cur);
    }
  }
  return categories.filter((c) => keep.has(c.id));
}

// ── Carry keys ──────────────────────────────────────────────────────────────
// A row is identified by its name (plus category path for expenses) and its
// occurrence among same-named rows, which carry-forward preserves.

export function occurrenceKeys<T>(rows: T[], base: (row: T) => string): string[] {
  const seen = new Map<string, number>();
  return rows.map((row) => {
    const b = base(row);
    const n = seen.get(b) ?? 0;
    seen.set(b, n + 1);
    return `${b}\u0000${n}`;
  });
}

export const accountBase = (a: { name: string }) => a.name;
export const incomeBase = (i: { name: string }) => i.name;
export function expenseBase(categories: DraftCategory[]) {
  const paths = new Map(sortedCategories(categories).map((c) => [c.id, c.path]));
  return (e: { name: string; category_id: number }) => `${paths.get(e.category_id) ?? ''}\u0000${e.name}`;
}

// ── Seeding ─────────────────────────────────────────────────────────────────

export function nextMonth(year: number, month: number) {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

/**
 * Builds the wizard's starting point for (year, month) from the snapshot that
 * precedes it. Every account carries; recurring incomes and expenses carry with
 * fixed rows prefilled and variable rows left blank to fill in.
 */
export function seedDraft(year: number, month: number, prev: SourceSnapshot | null): Draft {
  if (!prev) return { year, month, items: [], categories: [], prevNetWorth: null };

  const items: DraftItem[] = [];

  const accountKeys = occurrenceKeys(prev.accounts, accountBase);
  prev.accounts.forEach((a, i) => {
    items.push({
      key: nextKey(), phase: 'accounts', name: a.name, prev: a.balance, value: null,
      recurrence: 'none', carryKey: accountKeys[i],
      type: a.type === 'liability' ? 'liability' : 'asset', category: a.category,
      totalPaid: a.total_paid, prevTotalPaid: a.total_paid,
    });
  });

  const incomes = prev.incomes.filter((i) => i.recurrence !== 'none');
  const incomeKeys = occurrenceKeys(incomes, incomeBase);
  incomes.forEach((inc, i) => {
    items.push({
      key: nextKey(), phase: 'incomes', name: inc.name, prev: inc.amount,
      value: inc.recurrence === 'fixed' ? inc.amount : null,
      recurrence: inc.recurrence, carryKey: incomeKeys[i], category: inc.category,
    });
  });

  const categories = pruneCategories(prev.categories, prev.expenses);
  const treeOrder = new Map(sortedCategories(categories).map((c, i) => [c.id, i]));
  const expenses = prev.expenses
    .filter((e) => e.recurrence !== 'none' && treeOrder.has(e.category_id))
    // Stable sort: rows keep their order within a category.
    .sort((a, b) => treeOrder.get(a.category_id)! - treeOrder.get(b.category_id)!);
  const expenseKeys = occurrenceKeys(expenses, expenseBase(categories));
  expenses.forEach((e, i) => {
    items.push({
      key: nextKey(), phase: 'expenses', name: e.name, prev: e.amount,
      value: e.recurrence === 'fixed' ? e.amount : null,
      recurrence: e.recurrence, carryKey: expenseKeys[i], categoryId: e.category_id,
    });
  });

  const prevNetWorth = sumNetWorth(prev.accounts);
  return { year, month, items, categories, prevNetWorth };
}

export function newItemKey() {
  return nextKey();
}

// ── Derived figures ─────────────────────────────────────────────────────────

export const itemsOf = (d: Draft, phase: Phase) => d.items.filter((i) => i.phase === phase);
export const isFilled = (i: DraftItem) => i.value !== null;

/** What gets saved: an untouched account keeps last month's balance; an untouched flow is 0. */
export const resolvedAmount = (i: DraftItem) => i.value ?? (i.phase === 'accounts' ? i.prev ?? 0 : 0);

export function draftTotals(d: Draft) {
  const sum = (phase: Phase) => itemsOf(d, phase).reduce((s, i) => s + resolvedAmount(i), 0);
  const netWorth = sumNetWorth(itemsOf(d, 'accounts').map((a) => ({ name: a.name, type: a.type ?? 'asset', balance: resolvedAmount(a) })));
  const income = sum('incomes');
  const expenses = sum('expenses');
  return {
    netWorth,
    netWorthDelta: d.prevNetWorth === null ? null : netWorth - d.prevNetWorth,
    income,
    expenses,
    surplus: income - expenses,
    filled: d.items.filter(isFilled).length,
    total: d.items.length,
  };
}

export function phaseProgress(d: Draft, phase: Phase) {
  const list = itemsOf(d, phase);
  return { filled: list.filter(isFilled).length, total: list.length };
}

// ── Validation ──────────────────────────────────────────────────────────────

export type DraftProblem = 'name' | 'category';

const MAX_TEXT = 100;
const validText = (s: string | undefined) => {
  const v = (s ?? '').trim();
  return v.length > 0 && v.length <= MAX_TEXT;
};

/** Problems that the server would reject, keyed by item. Mirrors `trimmedText`. */
export function draftProblems(d: Draft): { item: DraftItem; problem: DraftProblem }[] {
  const ids = new Set(d.categories.map((c) => c.id));
  const out: { item: DraftItem; problem: DraftProblem }[] = [];
  for (const item of d.items) {
    if (!validText(item.name)) out.push({ item, problem: 'name' });
    const badCategory = item.phase === 'expenses' ? !ids.has(item.categoryId ?? NaN) : !validText(item.category);
    if (badCategory) out.push({ item, problem: 'category' });
  }
  return out;
}

// ── Month choice ────────────────────────────────────────────────────────────

type YearMonth = { year: number; month: number };
const ord = (s: YearMonth) => s.year * 12 + s.month;

/** The month after the latest snapshot, or the current month when there is none. */
export function defaultNewMonth(snapshots: YearMonth[], today = new Date()): YearMonth {
  if (snapshots.length === 0) return { year: today.getFullYear(), month: today.getMonth() + 1 };
  const latest = snapshots.reduce((a, b) => (ord(b) > ord(a) ? b : a));
  return nextMonth(latest.year, latest.month);
}

/** The snapshot carry-forward will copy from: the latest one strictly before `target`. */
export function precedingSnapshot<T extends YearMonth>(snapshots: T[], target: YearMonth): T | null {
  return snapshots.filter((s) => ord(s) < ord(target)).reduce<T | null>((a, b) => (a === null || ord(b) > ord(a) ? b : a), null);
}
