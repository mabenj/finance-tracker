import type { Database } from 'bun:sqlite';
import type { Recurrence } from '../lib/validators';

interface AccountRow {
  name: string;
  type: string;
  category: string;
  balance: number;
  total_paid: number | null;
  position: number;
}

interface CategoryRow {
  id: number;
  name: string;
  parent_id: number | null;
  position: number;
}

interface ExpenseRow {
  name: string;
  amount: number;
  category_id: number;
  recurrence: Recurrence;
}

interface IncomeRow {
  name: string;
  amount: number;
  category: string;
  recurrence: Recurrence;
}

const DEFAULT_ACCOUNTS: Omit<AccountRow, 'position'>[] = [
  { name: 'Mortgage',              type: 'liability', category: 'debt',        balance: 0, total_paid: 0    },
  { name: 'Student Loan',          type: 'liability', category: 'debt',        balance: 0, total_paid: 0    },
  { name: 'Credit Card',           type: 'liability', category: 'debt',        balance: 0, total_paid: null },
  { name: 'Cash',                  type: 'asset',     category: 'cash',        balance: 0, total_paid: null },
  { name: 'Investment Portfolio',  type: 'asset',     category: 'investment',  balance: 0, total_paid: null },
  { name: 'CS:GO Inventory',       type: 'asset',     category: 'investment',  balance: 0, total_paid: null },
  { name: 'Coinbase Portfolio',    type: 'asset',     category: 'investment',  balance: 0, total_paid: null },
  { name: 'Apartment (Cash Paid)', type: 'asset',     category: 'real estate', balance: 0, total_paid: null },
];

export function carryForward(
  db: Database,
  newSnapshotId: number,
  previousSnapshotId: number | null
): void {
  const insertAccount = db.prepare(
    'INSERT INTO accounts (snapshot_id, name, type, category, balance, total_paid, position) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );

  if (previousSnapshotId === null) {
    DEFAULT_ACCOUNTS.forEach((acc, index) => {
      insertAccount.run(newSnapshotId, acc.name, acc.type, acc.category, acc.balance, acc.total_paid, index);
    });
    return;
  }

  // Step 1: Copy all accounts, preserving manual order via position.
  const prevAccounts = db
    .query<AccountRow, [number]>(
      'SELECT name, type, category, balance, total_paid, position FROM accounts WHERE snapshot_id = ? ORDER BY position, id'
    )
    .all(previousSnapshotId);

  for (const acc of prevAccounts) {
    insertAccount.run(newSnapshotId, acc.name, acc.type, acc.category, acc.balance, acc.total_paid, acc.position);
  }

  // Step 2: Copy the category tree, building old_id → new_id map.
  // ORDER BY id ensures parents (lower ids) are processed before their children,
  // keeping the id-remap valid. The source `position` is carried through so
  // sibling order survives (position is per-parent, so it can't drive this loop).
  const prevCategories = db
    .query<CategoryRow, [number]>(
      'SELECT id, name, parent_id, position FROM expense_categories WHERE snapshot_id = ? ORDER BY id'
    )
    .all(previousSnapshotId);

  // Only carry a category if its subtree contains a recurring expense — i.e. the
  // category itself or a descendant directly holds an expense whose recurrence is
  // not 'none' (fixed or variable). This prunes leaves and whole branches that
  // hold only one-off expenses or nothing, while keeping the full ancestor chain
  // of every survivor (a recurring grandchild keeps its parent and grandparent so
  // the remap can re-attach it).
  const directRecurring = db
    .query<{ category_id: number }, [number]>(
      "SELECT DISTINCT category_id FROM expenses WHERE snapshot_id = ? AND recurrence != 'none'"
    )
    .all(previousSnapshotId);

  const parentOf = new Map<number, number | null>();
  for (const cat of prevCategories) parentOf.set(cat.id, cat.parent_id);

  const keep = new Set<number>();
  for (const { category_id } of directRecurring) {
    // Walk up the parent chain; stop early once we hit an already-kept ancestor
    // (its own chain to the root is guaranteed kept already).
    let cur: number | null = category_id;
    while (cur !== null && !keep.has(cur)) {
      keep.add(cur);
      cur = parentOf.get(cur) ?? null;
    }
  }

  const idMap = new Map<number, number>();
  const insertCategory = db.prepare(
    'INSERT INTO expense_categories (snapshot_id, name, parent_id, position) VALUES (?, ?, ?, ?)'
  );

  for (const cat of prevCategories) {
    if (!keep.has(cat.id)) continue;
    let newParentId: number | null = null;
    if (cat.parent_id !== null) {
      const mapped = idMap.get(cat.parent_id);
      if (mapped === undefined) {
        throw new Error(
          `carry-forward: category id=${cat.id} references parent id=${cat.parent_id} which has not been copied yet`
        );
      }
      newParentId = mapped;
    }
    const result = insertCategory.run(newSnapshotId, cat.name, newParentId, cat.position);
    idMap.set(cat.id, Number(result.lastInsertRowid));
  }

  // Step 3: Copy recurring expenses with remapped category IDs. Only a subset
  // (recurrence != 'none') carries forward, so positions are re-packed
  // contiguously per destination category while preserving the survivors'
  // relative order. `fixed` rows keep their amount; `variable` rows reset to €0
  // to be filled in as the month unfolds. Both keep their recurrence kind.
  const recurringExpenses = db
    .query<ExpenseRow & { position: number }, [number]>(
      "SELECT name, amount, category_id, recurrence, position FROM expenses WHERE snapshot_id = ? AND recurrence != 'none' ORDER BY category_id, position, id"
    )
    .all(previousSnapshotId);

  const insertExpense = db.prepare(
    'INSERT INTO expenses (snapshot_id, name, amount, category_id, recurrence, position) VALUES (?, ?, ?, ?, ?, ?)'
  );

  const nextExpensePos = new Map<number, number>();
  for (const exp of recurringExpenses) {
    const newCategoryId = idMap.get(exp.category_id);
    if (newCategoryId === undefined) continue;
    const pos = nextExpensePos.get(newCategoryId) ?? 0;
    nextExpensePos.set(newCategoryId, pos + 1);
    const amount = exp.recurrence === 'variable' ? 0 : exp.amount;
    insertExpense.run(newSnapshotId, exp.name, amount, newCategoryId, exp.recurrence, pos);
  }

  // Step 4: Copy recurring incomes, re-packing positions contiguously. As with
  // expenses, `variable` incomes reset to €0 while `fixed` keep their amount.
  const recurringIncomes = db
    .query<IncomeRow, [number]>(
      "SELECT name, amount, category, recurrence FROM incomes WHERE snapshot_id = ? AND recurrence != 'none' ORDER BY position, id"
    )
    .all(previousSnapshotId);

  const insertIncome = db.prepare(
    'INSERT INTO incomes (snapshot_id, name, amount, category, recurrence, position) VALUES (?, ?, ?, ?, ?, ?)'
  );

  recurringIncomes.forEach((inc, index) => {
    const amount = inc.recurrence === 'variable' ? 0 : inc.amount;
    insertIncome.run(newSnapshotId, inc.name, amount, inc.category, inc.recurrence, index);
  });
}
