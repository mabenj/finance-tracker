import type { Database } from 'bun:sqlite';

interface AccountRow {
  name: string;
  type: string;
  category: string;
  balance: number;
  total_paid: number | null;
}

interface CategoryRow {
  id: number;
  name: string;
  parent_id: number | null;
}

interface ExpenseRow {
  name: string;
  amount: number;
  category_id: number;
  recurring: number;
}

interface IncomeRow {
  name: string;
  amount: number;
  category: string;
  recurring: number;
}

const DEFAULT_ACCOUNTS: AccountRow[] = [
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
    'INSERT INTO accounts (snapshot_id, name, type, category, balance, total_paid) VALUES (?, ?, ?, ?, ?, ?)'
  );

  if (previousSnapshotId === null) {
    for (const acc of DEFAULT_ACCOUNTS) {
      insertAccount.run(newSnapshotId, acc.name, acc.type, acc.category, acc.balance, acc.total_paid);
    }
    return;
  }

  // Step 1: Copy all accounts
  const prevAccounts = db
    .query<AccountRow, [number]>(
      'SELECT name, type, category, balance, total_paid FROM accounts WHERE snapshot_id = ?'
    )
    .all(previousSnapshotId);

  for (const acc of prevAccounts) {
    insertAccount.run(newSnapshotId, acc.name, acc.type, acc.category, acc.balance, acc.total_paid);
  }

  // Step 2: Copy the category tree, building old_id → new_id map
  // ORDER BY id ensures parents (lower ids) are processed before their children
  const prevCategories = db
    .query<CategoryRow, [number]>(
      'SELECT id, name, parent_id FROM expense_categories WHERE snapshot_id = ? ORDER BY id'
    )
    .all(previousSnapshotId);

  const idMap = new Map<number, number>();
  const insertCategory = db.prepare(
    'INSERT INTO expense_categories (snapshot_id, name, parent_id) VALUES (?, ?, ?)'
  );

  for (const cat of prevCategories) {
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
    const result = insertCategory.run(newSnapshotId, cat.name, newParentId);
    idMap.set(cat.id, Number(result.lastInsertRowid));
  }

  // Step 3: Copy recurring expenses with remapped category IDs
  const recurringExpenses = db
    .query<ExpenseRow, [number]>(
      'SELECT name, amount, category_id, recurring FROM expenses WHERE snapshot_id = ? AND recurring = 1'
    )
    .all(previousSnapshotId);

  const insertExpense = db.prepare(
    'INSERT INTO expenses (snapshot_id, name, amount, category_id, recurring) VALUES (?, ?, ?, ?, ?)'
  );

  for (const exp of recurringExpenses) {
    const newCategoryId = idMap.get(exp.category_id);
    if (newCategoryId === undefined) continue;
    insertExpense.run(newSnapshotId, exp.name, exp.amount, newCategoryId, exp.recurring);
  }

  // Step 4: Copy recurring incomes
  const recurringIncomes = db
    .query<IncomeRow, [number]>(
      'SELECT name, amount, category, recurring FROM incomes WHERE snapshot_id = ? AND recurring = 1'
    )
    .all(previousSnapshotId);

  const insertIncome = db.prepare(
    'INSERT INTO incomes (snapshot_id, name, amount, category, recurring) VALUES (?, ?, ?, ?, ?)'
  );

  for (const inc of recurringIncomes) {
    insertIncome.run(newSnapshotId, inc.name, inc.amount, inc.category, inc.recurring);
  }
}
