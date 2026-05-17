import { describe, test, expect } from 'bun:test';
import { Database } from 'bun:sqlite';
import { initDb } from '../db/schema';
import { appRouter } from './index';

function makeTestCaller() {
  const db = new Database(':memory:');
  initDb(db);
  const caller = appRouter.createCaller({ db });
  return { caller, db };
}

describe('incomes router', () => {
  test('upsert creates a new income when no id is provided', async () => {
    const { caller } = makeTestCaller();
    const snap = await caller.snapshots.create({ year: 2026, month: 1 });

    const income = await caller.incomes.upsert({
      snapshotId: snap.id,
      name: 'Salary',
      amount: 500000,
      category: 'Employment',
      recurring: true,
    });

    expect(income.id).toBeGreaterThan(0);
    expect(income.name).toBe('Salary');
    expect(income.amount).toBe(500000);
    expect(income.category).toBe('Employment');
    expect(income.recurring).toBe(1);
  });

  test('upsert updates an existing income when id is provided', async () => {
    const { caller } = makeTestCaller();
    const snap = await caller.snapshots.create({ year: 2026, month: 1 });
    const created = await caller.incomes.upsert({
      snapshotId: snap.id,
      name: 'Salary',
      amount: 500000,
      category: 'Employment',
      recurring: true,
    });

    const updated = await caller.incomes.upsert({
      id: created.id,
      snapshotId: snap.id,
      name: 'Bonus',
      amount: 100000,
      category: 'Employment',
      recurring: false,
    });

    expect(updated.id).toBe(created.id);
    expect(updated.name).toBe('Bonus');
    expect(updated.amount).toBe(100000);
    expect(updated.recurring).toBe(0);
  });

  test('updated_at advances when an income is created', async () => {
    const { caller, db } = makeTestCaller();
    db.run(
      "INSERT INTO snapshots (year, month, created_at, updated_at) VALUES (2026, 5, datetime('now', '-1 hour'), datetime('now', '-1 hour'))"
    );
    const snapId = db.query<{ id: number }, []>('SELECT last_insert_rowid() as id').get()!.id;
    const before = db
      .query<{ updated_at: string }, [number]>('SELECT updated_at FROM snapshots WHERE id = ?')
      .get(snapId)!.updated_at;

    await caller.incomes.upsert({
      snapshotId: snapId,
      name: 'Salary',
      amount: 500000,
      category: 'Employment',
      recurring: true,
    });

    const after = db
      .query<{ updated_at: string }, [number]>('SELECT updated_at FROM snapshots WHERE id = ?')
      .get(snapId)!.updated_at;
    expect(after > before).toBe(true);
  });

  test('updated_at advances when an income is deleted', async () => {
    const { caller, db } = makeTestCaller();
    db.run(
      "INSERT INTO snapshots (year, month, created_at, updated_at) VALUES (2026, 6, datetime('now', '-1 hour'), datetime('now', '-1 hour'))"
    );
    const snapId = db.query<{ id: number }, []>('SELECT last_insert_rowid() as id').get()!.id;
    db.run(
      'INSERT INTO incomes (snapshot_id, name, amount, category, recurring) VALUES (?, ?, ?, ?, ?)',
      [snapId, 'Salary', 500000, 'Employment', 1]
    );
    const incomeId = db.query<{ id: number }, []>('SELECT last_insert_rowid() as id').get()!.id;

    const before = db
      .query<{ updated_at: string }, [number]>('SELECT updated_at FROM snapshots WHERE id = ?')
      .get(snapId)!.updated_at;

    await caller.incomes.delete({ id: incomeId, snapshotId: snapId });

    const after = db
      .query<{ updated_at: string }, [number]>('SELECT updated_at FROM snapshots WHERE id = ?')
      .get(snapId)!.updated_at;
    expect(after > before).toBe(true);
  });

  test('upsert rejects negative amount', async () => {
    const { caller } = makeTestCaller();
    const snap = await caller.snapshots.create({ year: 2026, month: 1 });
    await expect(
      caller.incomes.upsert({
        snapshotId: snap.id,
        name: 'Salary',
        amount: -1,
        category: 'Employment',
        recurring: false,
      })
    ).rejects.toThrow();
  });

  test('upsert rejects empty name', async () => {
    const { caller } = makeTestCaller();
    const snap = await caller.snapshots.create({ year: 2026, month: 1 });
    await expect(
      caller.incomes.upsert({
        snapshotId: snap.id,
        name: '',
        amount: 100000,
        category: 'Employment',
        recurring: false,
      })
    ).rejects.toThrow();
  });

  test('upsert rejects name over 100 characters', async () => {
    const { caller } = makeTestCaller();
    const snap = await caller.snapshots.create({ year: 2026, month: 1 });
    await expect(
      caller.incomes.upsert({
        snapshotId: snap.id,
        name: 'a'.repeat(101),
        amount: 100000,
        category: 'Employment',
        recurring: false,
      })
    ).rejects.toThrow();
  });

  test('upsert rejects empty category', async () => {
    const { caller } = makeTestCaller();
    const snap = await caller.snapshots.create({ year: 2026, month: 1 });
    await expect(
      caller.incomes.upsert({
        snapshotId: snap.id,
        name: 'Salary',
        amount: 100000,
        category: '',
        recurring: false,
      })
    ).rejects.toThrow();
  });

  test('delete returns not-found for unknown income id', async () => {
    const { caller } = makeTestCaller();
    const snap = await caller.snapshots.create({ year: 2026, month: 1 });
    await expect(
      caller.incomes.delete({ id: 999999, snapshotId: snap.id })
    ).rejects.toThrow();
  });

  test('upsert create returns NOT_FOUND for non-existent snapshot', async () => {
    const { caller } = makeTestCaller();
    await expect(
      caller.incomes.upsert({
        snapshotId: 999999,
        name: 'Salary',
        amount: 100000,
        category: 'Employment',
        recurring: false,
      })
    ).rejects.toThrow();
  });

  test('upsert trims whitespace from name and category', async () => {
    const { caller } = makeTestCaller();
    const snap = await caller.snapshots.create({ year: 2026, month: 1 });
    const income = await caller.incomes.upsert({
      snapshotId: snap.id,
      name: '  Salary  ',
      amount: 100000,
      category: '  Employment  ',
      recurring: false,
    });
    expect(income.name).toBe('Salary');
    expect(income.category).toBe('Employment');
  });

  test('delete returns the deleted income entity', async () => {
    const { caller } = makeTestCaller();
    const snap = await caller.snapshots.create({ year: 2026, month: 1 });
    const created = await caller.incomes.upsert({
      snapshotId: snap.id,
      name: 'Salary',
      amount: 500000,
      category: 'Employment',
      recurring: true,
    });

    const result = await caller.incomes.delete({ id: created.id, snapshotId: snap.id });
    expect(result.id).toBe(created.id);
    expect(result.name).toBe('Salary');
  });

  test('upsert update rejects income belonging to a different snapshot', async () => {
    const { caller } = makeTestCaller();
    const snap1 = await caller.snapshots.create({ year: 2026, month: 1 });
    const snap2 = await caller.snapshots.create({ year: 2026, month: 2 });
    const income = await caller.incomes.upsert({
      snapshotId: snap1.id,
      name: 'Salary',
      amount: 500000,
      category: 'Employment',
      recurring: true,
    });

    await expect(
      caller.incomes.upsert({
        id: income.id,
        snapshotId: snap2.id,
        name: 'Salary',
        amount: 500000,
        category: 'Employment',
        recurring: false,
      })
    ).rejects.toThrow();
  });

  test('snapshots.get returns incomes', async () => {
    const { caller } = makeTestCaller();
    const snap = await caller.snapshots.create({ year: 2026, month: 1 });
    await caller.incomes.upsert({
      snapshotId: snap.id,
      name: 'Salary',
      amount: 500000,
      category: 'Employment',
      recurring: true,
    });

    const full = await caller.snapshots.get({ id: snap.id });
    expect(full.incomes).toHaveLength(1);
    expect(full.incomes[0].name).toBe('Salary');
  });
});
