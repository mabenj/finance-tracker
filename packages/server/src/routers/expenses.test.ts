import { describe, test, expect } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { appRouter } from './index';

function makeTestCaller() {
  const db = new Database(':memory:');
  runMigrations(db);
  const caller = appRouter.createCaller({ db });
  return { caller, db };
}

describe('expenses router', () => {
  test('upsert creates a new expense when no id is provided', async () => {
    const { caller } = makeTestCaller();
    const snap = await caller.snapshots.create({ year: 2026, month: 1 });
    const cat = await caller.categories.create({ snapshotId: snap.id, name: 'Housing' });

    const expense = await caller.expenses.upsert({
      snapshotId: snap.id,
      name: 'Rent',
      amount: 80000,
      categoryId: cat.id,
      recurring: true,
    });

    expect(expense.id).toBeGreaterThan(0);
    expect(expense.name).toBe('Rent');
    expect(expense.amount).toBe(80000);
    expect(expense.category_id).toBe(cat.id);
    expect(expense.recurring).toBe(1);
  });

  test('upsert updates an existing expense when id is provided', async () => {
    const { caller } = makeTestCaller();
    const snap = await caller.snapshots.create({ year: 2026, month: 1 });
    const cat = await caller.categories.create({ snapshotId: snap.id, name: 'Housing' });

    const created = await caller.expenses.upsert({
      snapshotId: snap.id,
      name: 'Rent',
      amount: 80000,
      categoryId: cat.id,
      recurring: true,
    });

    const updated = await caller.expenses.upsert({
      id: created.id,
      snapshotId: snap.id,
      name: 'Rent Updated',
      amount: 85000,
      categoryId: cat.id,
      recurring: false,
    });

    expect(updated.id).toBe(created.id);
    expect(updated.name).toBe('Rent Updated');
    expect(updated.amount).toBe(85000);
    expect(updated.recurring).toBe(0);
  });

  test('upsert rejects category_id from a different snapshot', async () => {
    const { caller } = makeTestCaller();
    const snap1 = await caller.snapshots.create({ year: 2026, month: 1 });
    const snap2 = await caller.snapshots.create({ year: 2026, month: 2 });
    const cat = await caller.categories.create({ snapshotId: snap1.id, name: 'Housing' });

    await expect(
      caller.expenses.upsert({
        snapshotId: snap2.id,
        name: 'Rent',
        amount: 80000,
        categoryId: cat.id,
        recurring: false,
      })
    ).rejects.toThrow();
  });

  test('upsert accepts amount=0', async () => {
    const { caller } = makeTestCaller();
    const snap = await caller.snapshots.create({ year: 2026, month: 1 });
    const cat = await caller.categories.create({ snapshotId: snap.id, name: 'Housing' });

    const expense = await caller.expenses.upsert({
      snapshotId: snap.id,
      name: 'Free Item',
      amount: 0,
      categoryId: cat.id,
      recurring: false,
    });

    expect(expense.amount).toBe(0);
  });

  test('upsert rejects amount=-1', async () => {
    const { caller } = makeTestCaller();
    const snap = await caller.snapshots.create({ year: 2026, month: 1 });
    const cat = await caller.categories.create({ snapshotId: snap.id, name: 'Housing' });

    await expect(
      caller.expenses.upsert({
        snapshotId: snap.id,
        name: 'Invalid',
        amount: -1,
        categoryId: cat.id,
        recurring: false,
      })
    ).rejects.toThrow();
  });

  test('upsert rejects empty name', async () => {
    const { caller } = makeTestCaller();
    const snap = await caller.snapshots.create({ year: 2026, month: 1 });
    const cat = await caller.categories.create({ snapshotId: snap.id, name: 'Housing' });

    await expect(
      caller.expenses.upsert({
        snapshotId: snap.id,
        name: '',
        amount: 1000,
        categoryId: cat.id,
        recurring: false,
      })
    ).rejects.toThrow();
  });

  test('upsert rejects name over 100 characters', async () => {
    const { caller } = makeTestCaller();
    const snap = await caller.snapshots.create({ year: 2026, month: 1 });
    const cat = await caller.categories.create({ snapshotId: snap.id, name: 'Housing' });

    await expect(
      caller.expenses.upsert({
        snapshotId: snap.id,
        name: 'a'.repeat(101),
        amount: 1000,
        categoryId: cat.id,
        recurring: false,
      })
    ).rejects.toThrow();
  });

  test('upsert trims whitespace from name', async () => {
    const { caller } = makeTestCaller();
    const snap = await caller.snapshots.create({ year: 2026, month: 1 });
    const cat = await caller.categories.create({ snapshotId: snap.id, name: 'Housing' });

    const expense = await caller.expenses.upsert({
      snapshotId: snap.id,
      name: '  Rent  ',
      amount: 80000,
      categoryId: cat.id,
      recurring: false,
    });

    expect(expense.name).toBe('Rent');
  });

  test('delete removes expense and returns it', async () => {
    const { caller, db } = makeTestCaller();
    const snap = await caller.snapshots.create({ year: 2026, month: 1 });
    const cat = await caller.categories.create({ snapshotId: snap.id, name: 'Housing' });

    const created = await caller.expenses.upsert({
      snapshotId: snap.id,
      name: 'Rent',
      amount: 80000,
      categoryId: cat.id,
      recurring: false,
    });

    const result = await caller.expenses.delete({ id: created.id, snapshotId: snap.id });
    expect(result.id).toBe(created.id);
    expect(result.name).toBe('Rent');

    const count = db
      .query<{ count: number }, [number]>(
        'SELECT count(*) as count FROM expenses WHERE snapshot_id = ?'
      )
      .get(snap.id)!.count;
    expect(count).toBe(0);
  });

  test('delete returns NOT_FOUND for unknown expense id', async () => {
    const { caller } = makeTestCaller();
    const snap = await caller.snapshots.create({ year: 2026, month: 1 });

    await expect(
      caller.expenses.delete({ id: 999999, snapshotId: snap.id })
    ).rejects.toThrow();
  });

  test('delete rejects expense belonging to a different snapshot', async () => {
    const { caller } = makeTestCaller();
    const snap1 = await caller.snapshots.create({ year: 2026, month: 1 });
    const snap2 = await caller.snapshots.create({ year: 2026, month: 2 });
    const cat = await caller.categories.create({ snapshotId: snap1.id, name: 'Housing' });
    const expense = await caller.expenses.upsert({
      snapshotId: snap1.id,
      name: 'Rent',
      amount: 80000,
      categoryId: cat.id,
      recurring: false,
    });

    await expect(
      caller.expenses.delete({ id: expense.id, snapshotId: snap2.id })
    ).rejects.toThrow();
  });

  test('updated_at advances on upsert create', async () => {
    const { caller, db } = makeTestCaller();
    db.run(
      "INSERT INTO snapshots (year, month, created_at, updated_at) VALUES (2026, 5, datetime('now', '-1 hour'), datetime('now', '-1 hour'))"
    );
    const snapId = db.query<{ id: number }, []>('SELECT last_insert_rowid() as id').get()!.id;
    const catResult = db
      .prepare('INSERT INTO expense_categories (snapshot_id, name, parent_id) VALUES (?, ?, ?)')
      .run(snapId, 'Housing', null);
    const catId = Number(catResult.lastInsertRowid);

    const before = db
      .query<{ updated_at: string }, [number]>('SELECT updated_at FROM snapshots WHERE id = ?')
      .get(snapId)!.updated_at;

    await caller.expenses.upsert({
      snapshotId: snapId,
      name: 'Rent',
      amount: 80000,
      categoryId: catId,
      recurring: false,
    });

    const after = db
      .query<{ updated_at: string }, [number]>('SELECT updated_at FROM snapshots WHERE id = ?')
      .get(snapId)!.updated_at;
    expect(after > before).toBe(true);
  });

  test('updated_at advances on delete', async () => {
    const { caller, db } = makeTestCaller();
    db.run(
      "INSERT INTO snapshots (year, month, created_at, updated_at) VALUES (2026, 6, datetime('now', '-1 hour'), datetime('now', '-1 hour'))"
    );
    const snapId = db.query<{ id: number }, []>('SELECT last_insert_rowid() as id').get()!.id;
    const catResult = db
      .prepare('INSERT INTO expense_categories (snapshot_id, name, parent_id) VALUES (?, ?, ?)')
      .run(snapId, 'Housing', null);
    const catId = Number(catResult.lastInsertRowid);
    const expResult = db
      .prepare(
        'INSERT INTO expenses (snapshot_id, name, amount, category_id, recurring) VALUES (?, ?, ?, ?, ?)'
      )
      .run(snapId, 'Rent', 80000, catId, 0);
    const expId = Number(expResult.lastInsertRowid);

    const before = db
      .query<{ updated_at: string }, [number]>('SELECT updated_at FROM snapshots WHERE id = ?')
      .get(snapId)!.updated_at;

    await caller.expenses.delete({ id: expId, snapshotId: snapId });

    const after = db
      .query<{ updated_at: string }, [number]>('SELECT updated_at FROM snapshots WHERE id = ?')
      .get(snapId)!.updated_at;
    expect(after > before).toBe(true);
  });

  test('snapshots.get returns expenses', async () => {
    const { caller } = makeTestCaller();
    const snap = await caller.snapshots.create({ year: 2026, month: 1 });
    const cat = await caller.categories.create({ snapshotId: snap.id, name: 'Housing' });
    await caller.expenses.upsert({
      snapshotId: snap.id,
      name: 'Rent',
      amount: 80000,
      categoryId: cat.id,
      recurring: true,
    });

    const full = await caller.snapshots.get({ id: snap.id });
    expect(full.expenses).toHaveLength(1);
    expect(full.expenses[0].name).toBe('Rent');
    expect(full.expenses[0].amount).toBe(80000);
    expect(full.expenses[0].category_id).toBe(cat.id);
  });
});
