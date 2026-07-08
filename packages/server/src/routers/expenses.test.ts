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
      recurrence: 'fixed',
    });

    expect(expense.id).toBeGreaterThan(0);
    expect(expense.name).toBe('Rent');
    expect(expense.amount).toBe(80000);
    expect(expense.category_id).toBe(cat.id);
    expect(expense.recurrence).toBe('fixed');
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
      recurrence: 'fixed',
    });

    const updated = await caller.expenses.upsert({
      id: created.id,
      snapshotId: snap.id,
      name: 'Rent Updated',
      amount: 85000,
      categoryId: cat.id,
      recurrence: 'none',
    });

    expect(updated.id).toBe(created.id);
    expect(updated.name).toBe('Rent Updated');
    expect(updated.amount).toBe(85000);
    expect(updated.recurrence).toBe('none');
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
        recurrence: 'none',
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
      recurrence: 'none',
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
        recurrence: 'none',
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
        recurrence: 'none',
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
        recurrence: 'none',
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
      recurrence: 'none',
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
      recurrence: 'none',
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
      recurrence: 'none',
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
      recurrence: 'none',
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
        'INSERT INTO expenses (snapshot_id, name, amount, category_id, recurrence) VALUES (?, ?, ?, ?, ?)'
      )
      .run(snapId, 'Rent', 80000, catId, 'none');
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
      recurrence: 'fixed',
    });

    const full = await caller.snapshots.get({ id: snap.id });
    expect(full.expenses).toHaveLength(1);
    expect(full.expenses[0].name).toBe('Rent');
    expect(full.expenses[0].amount).toBe(80000);
    expect(full.expenses[0].category_id).toBe(cat.id);
    expect(full.expenses[0].recurrence).toBe('fixed');
  });

  test('upsert accepts the variable recurrence kind and returns it', async () => {
    const { caller } = makeTestCaller();
    const snap = await caller.snapshots.create({ year: 2026, month: 1 });
    const cat = await caller.categories.create({ snapshotId: snap.id, name: 'Groceries' });

    const expense = await caller.expenses.upsert({
      snapshotId: snap.id,
      name: 'Food',
      amount: 74000,
      categoryId: cat.id,
      recurrence: 'variable',
    });

    expect(expense.recurrence).toBe('variable');
  });

  test('upsert rejects an unknown recurrence value', async () => {
    const { caller } = makeTestCaller();
    const snap = await caller.snapshots.create({ year: 2026, month: 1 });
    const cat = await caller.categories.create({ snapshotId: snap.id, name: 'Housing' });

    await expect(
      caller.expenses.upsert({
        snapshotId: snap.id,
        name: 'Rent',
        amount: 80000,
        categoryId: cat.id,
        // @ts-expect-error — invalid recurrence kind must be rejected by the validator
        recurrence: 'weekly',
      })
    ).rejects.toThrow();
  });

  test('upsert rejects the old boolean recurring shape', async () => {
    const { caller } = makeTestCaller();
    const snap = await caller.snapshots.create({ year: 2026, month: 1 });
    const cat = await caller.categories.create({ snapshotId: snap.id, name: 'Housing' });

    await expect(
      caller.expenses.upsert({
        snapshotId: snap.id,
        name: 'Rent',
        amount: 80000,
        categoryId: cat.id,
        // @ts-expect-error — the boolean `recurring` field no longer exists; `recurrence` is required
        recurring: true,
      })
    ).rejects.toThrow();
  });

  // ── Carried amount: server-managed, read-only to the client ────────────────

  test('a hand-created expense has a null carried_amount and reads it back', async () => {
    const { caller } = makeTestCaller();
    const snap = await caller.snapshots.create({ year: 2026, month: 1 });
    const cat = await caller.categories.create({ snapshotId: snap.id, name: 'Groceries' });

    const created = await caller.expenses.upsert({
      snapshotId: snap.id,
      name: 'Food',
      amount: 12000,
      categoryId: cat.id,
      recurrence: 'variable',
    });
    expect(created.carried_amount).toBeNull();

    const full = await caller.snapshots.get({ id: snap.id });
    expect(full.expenses[0].carried_amount).toBeNull();
  });

  test('upsert ignores a client-supplied carried_amount', async () => {
    const { caller } = makeTestCaller();
    const snap = await caller.snapshots.create({ year: 2026, month: 1 });
    const cat = await caller.categories.create({ snapshotId: snap.id, name: 'Groceries' });

    const created = await caller.expenses.upsert({
      snapshotId: snap.id,
      name: 'Food',
      amount: 12000,
      categoryId: cat.id,
      recurrence: 'variable',
      // @ts-expect-error — carried_amount is server-managed and not part of the input
      carried_amount: 999999,
    });
    expect(created.carried_amount).toBeNull();
  });

  test('a carried expense keeps its carried_amount through edits (rename, amount, category, kind)', async () => {
    const { caller } = makeTestCaller();
    const jan = await caller.snapshots.create({ year: 2026, month: 1 });
    const cat = await caller.categories.create({ snapshotId: jan.id, name: 'Groceries' });
    await caller.expenses.upsert({
      snapshotId: jan.id,
      name: 'Food',
      amount: 74000,
      categoryId: cat.id,
      recurrence: 'variable',
    });

    // Feb carry-forward stamps carried_amount = 74000, amount 0.
    const feb = await caller.snapshots.create({ year: 2026, month: 2 });
    const febFull = await caller.snapshots.get({ id: feb.id });
    const carried = febFull.expenses[0];
    const otherCat = await caller.categories.create({ snapshotId: feb.id, name: 'Elsewhere' });
    expect(carried.carried_amount).toBe(74000);
    expect(carried.amount).toBe(0); // variable carries in at €0



    // Rename + change amount + re-parent + flip the kind: none of it touches the stamp.
    const updated = await caller.expenses.upsert({
      id: carried.id,
      snapshotId: feb.id,
      name: 'Groceries renamed',
      amount: 20000,
      categoryId: otherCat.id,
      recurrence: 'fixed',
    });
    expect(updated.carried_amount).toBe(74000);
    expect(updated.name).toBe('Groceries renamed');
    expect(updated.amount).toBe(20000);
    expect(updated.recurrence).toBe('fixed');
  });
});

describe('expenses reorder', () => {
  test('reorder applies order within a category', async () => {
    const { caller } = makeTestCaller();
    const snap = await caller.snapshots.create({ year: 2026, month: 1 });
    const cat = await caller.categories.create({ snapshotId: snap.id, name: 'Housing' });
    const ids: number[] = [];
    for (const name of ['A', 'B', 'C']) {
      const e = await caller.expenses.upsert({ snapshotId: snap.id, name, amount: 1000, categoryId: cat.id, recurrence: 'none' });
      ids.push(e.id);
    }
    const reordered = [ids[2], ids[0], ids[1]];

    await caller.expenses.reorder({ snapshotId: snap.id, categoryId: cat.id, orderedIds: reordered });

    const full = await caller.snapshots.get({ id: snap.id });
    const inCat = full.expenses.filter((e) => e.category_id === cat.id).map((e) => e.id);
    expect(inCat).toEqual(reordered);
  });

  test('reorder rejects an expense from a different category', async () => {
    const { caller } = makeTestCaller();
    const snap = await caller.snapshots.create({ year: 2026, month: 1 });
    const catA = await caller.categories.create({ snapshotId: snap.id, name: 'A' });
    const catB = await caller.categories.create({ snapshotId: snap.id, name: 'B' });
    const a = await caller.expenses.upsert({ snapshotId: snap.id, name: 'a', amount: 1000, categoryId: catA.id, recurrence: 'none' });
    const b = await caller.expenses.upsert({ snapshotId: snap.id, name: 'b', amount: 1000, categoryId: catB.id, recurrence: 'none' });
    await expect(
      caller.expenses.reorder({ snapshotId: snap.id, categoryId: catA.id, orderedIds: [a.id, b.id] })
    ).rejects.toThrow();
  });

  test('reorder rejects when a sibling is missing', async () => {
    const { caller } = makeTestCaller();
    const snap = await caller.snapshots.create({ year: 2026, month: 1 });
    const cat = await caller.categories.create({ snapshotId: snap.id, name: 'Housing' });
    const ids: number[] = [];
    for (const name of ['A', 'B']) {
      const e = await caller.expenses.upsert({ snapshotId: snap.id, name, amount: 1000, categoryId: cat.id, recurrence: 'none' });
      ids.push(e.id);
    }
    await expect(
      caller.expenses.reorder({ snapshotId: snap.id, categoryId: cat.id, orderedIds: [ids[0]] })
    ).rejects.toThrow();
  });

  test('moving an expense to another category places it last there', async () => {
    const { caller } = makeTestCaller();
    const snap = await caller.snapshots.create({ year: 2026, month: 1 });
    const catA = await caller.categories.create({ snapshotId: snap.id, name: 'A' });
    const catB = await caller.categories.create({ snapshotId: snap.id, name: 'B' });
    // `moved` is created first (lowest id), so id-order alone would place it first in B.
    const moved = await caller.expenses.upsert({ snapshotId: snap.id, name: 'moved', amount: 1000, categoryId: catA.id, recurrence: 'none' });
    const b1 = await caller.expenses.upsert({ snapshotId: snap.id, name: 'b1', amount: 1000, categoryId: catB.id, recurrence: 'none' });
    const b2 = await caller.expenses.upsert({ snapshotId: snap.id, name: 'b2', amount: 1000, categoryId: catB.id, recurrence: 'none' });

    await caller.expenses.upsert({ id: moved.id, snapshotId: snap.id, name: 'moved', amount: 1000, categoryId: catB.id, recurrence: 'none' });

    const full = await caller.snapshots.get({ id: snap.id });
    const inB = full.expenses.filter((e) => e.category_id === catB.id).map((e) => e.id);
    expect(inB).toEqual([b1.id, b2.id, moved.id]);
  });
});
