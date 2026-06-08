import { describe, test, expect } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { carryForward } from './carry-forward';

function makeDb() {
  const db = new Database(':memory:');
  runMigrations(db);
  return db;
}

function insertSnapshot(db: Database, year: number, month: number): number {
  db.run('INSERT INTO snapshots (year, month) VALUES (?, ?)', [year, month]);
  return Number(db.query<{ id: number }, []>('SELECT last_insert_rowid() as id').get()!.id);
}

describe('carryForward', () => {
  test('first snapshot seeds 8 default accounts', () => {
    const db = makeDb();
    const newId = insertSnapshot(db, 2026, 1);
    carryForward(db, newId, null);

    const accounts = db.query<{ name: string }, [number]>(
      'SELECT name FROM accounts WHERE snapshot_id = ? ORDER BY name'
    ).all(newId);

    expect(accounts).toHaveLength(8);
    const names = accounts.map((a) => a.name);
    expect(names).toContain('Mortgage');
    expect(names).toContain('Student Loan');
    expect(names).toContain('Credit Card');
    expect(names).toContain('Cash');
    expect(names).toContain('Investment Portfolio');
    expect(names).toContain('CS:GO Inventory');
    expect(names).toContain('Coinbase Portfolio');
    expect(names).toContain('Apartment (Cash Paid)');
  });

  test('copies account balances and total_paid from previous snapshot', () => {
    const db = makeDb();
    const prevId = insertSnapshot(db, 2026, 1);
    db.run(
      'INSERT INTO accounts (snapshot_id, name, type, category, balance, total_paid) VALUES (?, ?, ?, ?, ?, ?)',
      [prevId, 'Mortgage', 'liability', 'debt', 50000000, 12000000]
    );

    const newId = insertSnapshot(db, 2026, 2);
    carryForward(db, newId, prevId);

    const acc = db.query<{ balance: number; total_paid: number | null }, [number]>(
      "SELECT balance, total_paid FROM accounts WHERE snapshot_id = ? AND name = 'Mortgage'"
    ).get(newId);

    expect(acc).not.toBeNull();
    expect(acc!.balance).toBe(50000000);
    expect(acc!.total_paid).toBe(12000000);
  });

  test('copies category tree preserving hierarchy', () => {
    const db = makeDb();
    const prevId = insertSnapshot(db, 2026, 1);

    // root → child → grandchild
    db.run('INSERT INTO expense_categories (snapshot_id, name, parent_id) VALUES (?, ?, NULL)', [prevId, 'Root']);
    const root = db.query<{ id: number }, []>('SELECT last_insert_rowid() as id').get()!;
    db.run('INSERT INTO expense_categories (snapshot_id, name, parent_id) VALUES (?, ?, ?)', [prevId, 'Child', root.id]);
    const child = db.query<{ id: number }, []>('SELECT last_insert_rowid() as id').get()!;
    db.run('INSERT INTO expense_categories (snapshot_id, name, parent_id) VALUES (?, ?, ?)', [prevId, 'Grandchild', child.id]);

    const newId = insertSnapshot(db, 2026, 2);
    carryForward(db, newId, prevId);

    const newCats = db.query<{ name: string; parent_id: number | null }, [number]>(
      'SELECT name, parent_id FROM expense_categories WHERE snapshot_id = ? ORDER BY id'
    ).all(newId);

    expect(newCats).toHaveLength(3);
    const [newRoot, newChild, newGrandchild] = newCats;
    expect(newRoot.name).toBe('Root');
    expect(newRoot.parent_id).toBeNull();
    expect(newChild.name).toBe('Child');
    expect(newChild.parent_id).not.toBeNull();
    expect(newGrandchild.name).toBe('Grandchild');
    expect(newGrandchild.parent_id).toBe(newChild.parent_id! + 1 /* the child's new id */);
  });

  test('remaps category IDs for recurring expenses', () => {
    const db = makeDb();
    const prevId = insertSnapshot(db, 2026, 1);

    db.run('INSERT INTO expense_categories (snapshot_id, name, parent_id) VALUES (?, ?, NULL)', [prevId, 'Housing']);
    const cat = db.query<{ id: number }, []>('SELECT last_insert_rowid() as id').get()!;
    const oldCatId = cat.id;

    db.run(
      'INSERT INTO expenses (snapshot_id, name, amount, category_id, recurring) VALUES (?, ?, ?, ?, ?)',
      [prevId, 'Rent', 100000, oldCatId, 1]
    );

    const newId = insertSnapshot(db, 2026, 2);
    carryForward(db, newId, prevId);

    const newCat = db.query<{ id: number }, [number]>(
      'SELECT id FROM expense_categories WHERE snapshot_id = ?'
    ).get(newId)!;

    const newExp = db.query<{ category_id: number }, [number]>(
      'SELECT category_id FROM expenses WHERE snapshot_id = ?'
    ).get(newId);

    expect(newExp).not.toBeNull();
    expect(newExp!.category_id).toBe(newCat.id);
    expect(newExp!.category_id).not.toBe(oldCatId);
  });

  test('skips non-recurring expenses', () => {
    const db = makeDb();
    const prevId = insertSnapshot(db, 2026, 1);
    db.run('INSERT INTO expense_categories (snapshot_id, name, parent_id) VALUES (?, ?, NULL)', [prevId, 'Misc']);
    const cat = db.query<{ id: number }, []>('SELECT last_insert_rowid() as id').get()!;
    db.run('INSERT INTO expenses (snapshot_id, name, amount, category_id, recurring) VALUES (?, ?, ?, ?, ?)', [prevId, 'Recurring', 1000, cat.id, 1]);
    db.run('INSERT INTO expenses (snapshot_id, name, amount, category_id, recurring) VALUES (?, ?, ?, ?, ?)', [prevId, 'One-off', 5000, cat.id, 0]);

    const newId = insertSnapshot(db, 2026, 2);
    carryForward(db, newId, prevId);

    const count = db.query<{ n: number }, [number]>(
      'SELECT COUNT(*) as n FROM expenses WHERE snapshot_id = ?'
    ).get(newId)!.n;
    expect(count).toBe(1);
  });

  test('copies recurring incomes', () => {
    const db = makeDb();
    const prevId = insertSnapshot(db, 2026, 1);
    db.run(
      'INSERT INTO incomes (snapshot_id, name, amount, category, recurring) VALUES (?, ?, ?, ?, ?)',
      [prevId, 'Salary', 500000, 'Salary', 1]
    );

    const newId = insertSnapshot(db, 2026, 2);
    carryForward(db, newId, prevId);

    const inc = db.query<{ name: string; amount: number; category: string; recurring: number }, [number]>(
      'SELECT name, amount, category, recurring FROM incomes WHERE snapshot_id = ?'
    ).get(newId);

    expect(inc).not.toBeNull();
    expect(inc!.name).toBe('Salary');
    expect(inc!.amount).toBe(500000);
    expect(inc!.category).toBe('Salary');
    expect(inc!.recurring).toBe(1);
  });

  test('skips non-recurring incomes', () => {
    const db = makeDb();
    const prevId = insertSnapshot(db, 2026, 1);
    db.run('INSERT INTO incomes (snapshot_id, name, amount, category, recurring) VALUES (?, ?, ?, ?, ?)', [prevId, 'Salary', 500000, 'Salary', 1]);
    db.run('INSERT INTO incomes (snapshot_id, name, amount, category, recurring) VALUES (?, ?, ?, ?, ?)', [prevId, 'Bonus', 100000, 'Bonus', 0]);

    const newId = insertSnapshot(db, 2026, 2);
    carryForward(db, newId, prevId);

    const count = db.query<{ n: number }, [number]>(
      'SELECT COUNT(*) as n FROM incomes WHERE snapshot_id = ?'
    ).get(newId)!.n;
    expect(count).toBe(1);
  });

  test('uses nearest prior snapshot, not literal prior month', () => {
    const db = makeDb();

    // Create Jan and Mar, then create Feb — should carry from Jan
    const janId = insertSnapshot(db, 2026, 1);
    db.run('INSERT INTO accounts (snapshot_id, name, type, category, balance) VALUES (?, ?, ?, ?, ?)', [
      janId, 'JanAccount', 'asset', 'cash', 11111,
    ]);

    const marId = insertSnapshot(db, 2026, 3);
    db.run('INSERT INTO accounts (snapshot_id, name, type, category, balance) VALUES (?, ?, ?, ?, ?)', [
      marId, 'MarAccount', 'asset', 'cash', 33333,
    ]);

    const febId = insertSnapshot(db, 2026, 2);
    carryForward(db, febId, janId); // previous of Feb is Jan, not Mar

    const accounts = db.query<{ name: string }, [number]>(
      'SELECT name FROM accounts WHERE snapshot_id = ?'
    ).all(febId);

    expect(accounts.map((a) => a.name)).toContain('JanAccount');
    expect(accounts.map((a) => a.name)).not.toContain('MarAccount');
  });

  test('preserves manual account order via position', () => {
    const db = makeDb();
    const prevId = insertSnapshot(db, 2026, 1);
    // positions deliberately out of id order
    db.run('INSERT INTO accounts (snapshot_id, name, type, category, balance, position) VALUES (?, ?, ?, ?, ?, ?)', [prevId, 'first', 'asset', 'cash', 0, 2]);
    db.run('INSERT INTO accounts (snapshot_id, name, type, category, balance, position) VALUES (?, ?, ?, ?, ?, ?)', [prevId, 'second', 'asset', 'cash', 0, 0]);
    db.run('INSERT INTO accounts (snapshot_id, name, type, category, balance, position) VALUES (?, ?, ?, ?, ?, ?)', [prevId, 'third', 'asset', 'cash', 0, 1]);

    const newId = insertSnapshot(db, 2026, 2);
    carryForward(db, newId, prevId);

    const names = db
      .query<{ name: string }, [number]>('SELECT name FROM accounts WHERE snapshot_id = ? ORDER BY position, id')
      .all(newId)
      .map((r) => r.name);
    expect(names).toEqual(['second', 'third', 'first']);
  });

  test('preserves subcategory order within a parent via position', () => {
    const db = makeDb();
    const prevId = insertSnapshot(db, 2026, 1);
    db.run('INSERT INTO expense_categories (snapshot_id, name, parent_id, position) VALUES (?, ?, NULL, 0)', [prevId, 'Root']);
    const rootId = Number(db.query<{ id: number }, []>('SELECT last_insert_rowid() as id').get()!.id);
    db.run('INSERT INTO expense_categories (snapshot_id, name, parent_id, position) VALUES (?, ?, ?, ?)', [prevId, 'x', rootId, 2]);
    db.run('INSERT INTO expense_categories (snapshot_id, name, parent_id, position) VALUES (?, ?, ?, ?)', [prevId, 'y', rootId, 0]);
    db.run('INSERT INTO expense_categories (snapshot_id, name, parent_id, position) VALUES (?, ?, ?, ?)', [prevId, 'z', rootId, 1]);

    const newId = insertSnapshot(db, 2026, 2);
    carryForward(db, newId, prevId);

    const newRoot = db
      .query<{ id: number }, [number]>('SELECT id FROM expense_categories WHERE snapshot_id = ? AND parent_id IS NULL')
      .get(newId)!;
    const subs = db
      .query<{ name: string }, [number]>('SELECT name FROM expense_categories WHERE parent_id = ? ORDER BY position, id')
      .all(newRoot.id)
      .map((r) => r.name);
    expect(subs).toEqual(['y', 'z', 'x']);
  });

  test('re-packs recurring expense positions contiguously', () => {
    const db = makeDb();
    const prevId = insertSnapshot(db, 2026, 1);
    db.run('INSERT INTO expense_categories (snapshot_id, name, parent_id, position) VALUES (?, ?, NULL, 0)', [prevId, 'Cat']);
    const catId = Number(db.query<{ id: number }, []>('SELECT last_insert_rowid() as id').get()!.id);
    // positions 0..3; only positions 1 and 3 are recurring
    db.run('INSERT INTO expenses (snapshot_id, name, amount, category_id, recurring, position) VALUES (?, ?, ?, ?, ?, ?)', [prevId, 'e0', 100, catId, 0, 0]);
    db.run('INSERT INTO expenses (snapshot_id, name, amount, category_id, recurring, position) VALUES (?, ?, ?, ?, ?, ?)', [prevId, 'e1', 100, catId, 1, 1]);
    db.run('INSERT INTO expenses (snapshot_id, name, amount, category_id, recurring, position) VALUES (?, ?, ?, ?, ?, ?)', [prevId, 'e2', 100, catId, 0, 2]);
    db.run('INSERT INTO expenses (snapshot_id, name, amount, category_id, recurring, position) VALUES (?, ?, ?, ?, ?, ?)', [prevId, 'e3', 100, catId, 1, 3]);

    const newId = insertSnapshot(db, 2026, 2);
    carryForward(db, newId, prevId);

    const rows = db
      .query<{ name: string; position: number }, [number]>('SELECT name, position FROM expenses WHERE snapshot_id = ? ORDER BY position')
      .all(newId);
    expect(rows.map((r) => r.name)).toEqual(['e1', 'e3']);
    expect(rows.map((r) => r.position)).toEqual([0, 1]);
  });
});
