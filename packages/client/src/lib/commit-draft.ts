// Persists a wizard draft into a freshly created snapshot. The server has
// already run carry-forward, so the snapshot holds copies of last month's rows;
// each draft item is matched to its copy by carry key and only differences are
// sent. Copies with no draft counterpart (removed in the wizard) are deleted and
// draft rows with no copy are created. Uses only the existing CRUD mutations.
import type { Recurrence } from '../components/snapshot/RecurrenceControl';
import {
  accountBase, expenseBase, incomeBase, itemsOf, occurrenceKeys, resolvedAmount, sortedCategories,
  type Draft, type DraftCategory, type DraftItem,
} from './snapshot-draft';

export interface CreatedSnapshot {
  id: number;
  accounts: { id: number; name: string; type: string; category: string; balance: number; total_paid: number | null }[];
  incomes: { id: number; name: string; amount: number; category: string; recurrence: Recurrence }[];
  categories: DraftCategory[];
  expenses: { id: number; name: string; amount: number; category_id: number; recurrence: Recurrence }[];
}

type Ref = { id: number; snapshotId: number };

export interface CommitApi {
  createCategory(input: { snapshotId: number; name: string; parentId?: number }): Promise<{ id: number }>;
  upsertAccount(input: {
    id?: number; snapshotId: number; name: string; type: 'asset' | 'liability'; category: string; balance: number; totalPaid: number | null;
  }): Promise<unknown>;
  deleteAccount(input: Ref): Promise<unknown>;
  upsertIncome(input: { id?: number; snapshotId: number; name: string; amount: number; category: string; recurrence: Recurrence }): Promise<unknown>;
  deleteIncome(input: Ref): Promise<unknown>;
  upsertExpense(input: { id?: number; snapshotId: number; name: string; amount: number; categoryId: number; recurrence: Recurrence }): Promise<unknown>;
  deleteExpense(input: Ref): Promise<unknown>;
}

/** Pairs draft items with created rows by carry key. */
function match<R>(items: DraftItem[], rows: R[], rowKeys: string[]) {
  const byKey = new Map(rows.map((r, i) => [rowKeys[i], r]));
  const pairs: [DraftItem, R | null][] = items.map((item) => {
    const row = item.carryKey !== null ? byKey.get(item.carryKey) ?? null : null;
    if (item.carryKey !== null) byKey.delete(item.carryKey);
    return [item, row];
  });
  return { pairs, orphans: [...byKey.values()] };
}

export async function commitDraft(draft: Draft, created: CreatedSnapshot, api: CommitApi): Promise<void> {
  const snapshotId = created.id;
  const text = (s: string | undefined) => (s ?? '').trim();

  // Categories: carried ones already exist (matched by path); create the rest, parents first.
  const existing = new Map(sortedCategories(created.categories).map((c) => [c.path, c.id]));
  const categoryId = new Map<number, number>();
  for (const c of sortedCategories(draft.categories)) {
    const found = existing.get(c.path);
    if (found !== undefined) {
      categoryId.set(c.id, found);
      continue;
    }
    const parentId = c.parent_id === null ? undefined : categoryId.get(c.parent_id);
    const { id } = await api.createCategory({ snapshotId, name: c.name, parentId });
    categoryId.set(c.id, id);
  }

  // Accounts
  const accounts = match(itemsOf(draft, 'accounts'), created.accounts, occurrenceKeys(created.accounts, accountBase));
  for (const [item, row] of accounts.pairs) {
    const next = {
      name: text(item.name),
      type: item.type ?? 'asset',
      category: text(item.category),
      balance: resolvedAmount(item),
      totalPaid: item.type === 'liability' ? item.totalPaid ?? null : null,
    };
    const unchanged =
      row && row.name === next.name && row.type === next.type && row.category === next.category &&
      row.balance === next.balance && row.total_paid === next.totalPaid;
    if (!unchanged) await api.upsertAccount({ ...(row ? { id: row.id } : {}), snapshotId, ...next });
  }
  for (const row of accounts.orphans) await api.deleteAccount({ id: row.id, snapshotId });

  // Incomes
  const incomes = match(itemsOf(draft, 'incomes'), created.incomes, occurrenceKeys(created.incomes, incomeBase));
  for (const [item, row] of incomes.pairs) {
    const next = { name: text(item.name), amount: resolvedAmount(item), category: text(item.category), recurrence: item.recurrence };
    const unchanged =
      row && row.name === next.name && row.amount === next.amount && row.category === next.category && row.recurrence === next.recurrence;
    if (!unchanged) await api.upsertIncome({ ...(row ? { id: row.id } : {}), snapshotId, ...next });
  }
  for (const row of incomes.orphans) await api.deleteIncome({ id: row.id, snapshotId });

  // Expenses
  const expenseKeys = occurrenceKeys(created.expenses, expenseBase(created.categories));
  const expenses = match(itemsOf(draft, 'expenses'), created.expenses, expenseKeys);
  for (const [item, row] of expenses.pairs) {
    const cat = categoryId.get(item.categoryId ?? NaN);
    if (cat === undefined) throw new Error(`No category for expense "${item.name}"`);
    const next = { name: text(item.name), amount: resolvedAmount(item), categoryId: cat, recurrence: item.recurrence };
    const unchanged =
      row && row.name === next.name && row.amount === next.amount && row.category_id === next.categoryId && row.recurrence === next.recurrence;
    if (!unchanged) await api.upsertExpense({ ...(row ? { id: row.id } : {}), snapshotId, ...next });
  }
  for (const row of expenses.orphans) await api.deleteExpense({ id: row.id, snapshotId });
}
