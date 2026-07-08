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

describe('incomes router', () => {
  test('upsert creates a new income when no id is provided', async () => {
    const { caller } = makeTestCaller();
    const snap = await caller.snapshots.create({ year: 2026, month: 1 });

    const income = await caller.incomes.upsert({
      snapshotId: snap.id,
      name: 'Salary',
      amount: 500000,
      category: 'Employment',
      recurrence: 'fixed',
    });

    expect(income.id).toBeGreaterThan(0);
    expect(income.name).toBe('Salary');
    expect(income.amount).toBe(500000);
    expect(income.category).toBe('Employment');
    expect(income.recurrence).toBe('fixed');
  });

  test('upsert updates an existing income when id is provided', async () => {
    const { caller } = makeTestCaller();
    const snap = await caller.snapshots.create({ year: 2026, month: 1 });
    const created = await caller.incomes.upsert({
      snapshotId: snap.id,
      name: 'Salary',
      amount: 500000,
      category: 'Employment',
      recurrence: 'fixed',
    });

    const updated = await caller.incomes.upsert({
      id: created.id,
      snapshotId: snap.id,
      name: 'Bonus',
      amount: 100000,
      category: 'Employment',
      recurrence: 'none',
    });

    expect(updated.id).toBe(created.id);
    expect(updated.name).toBe('Bonus');
    expect(updated.amount).toBe(100000);
    expect(updated.recurrence).toBe('none');
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
      recurrence: 'fixed',
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
      'INSERT INTO incomes (snapshot_id, name, amount, category, recurrence) VALUES (?, ?, ?, ?, ?)',
      [snapId, 'Salary', 500000, 'Employment', 'fixed']
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
        recurrence: 'none',
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
        recurrence: 'none',
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
        recurrence: 'none',
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
        recurrence: 'none',
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
        recurrence: 'none',
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
      recurrence: 'none',
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
      recurrence: 'fixed',
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
      recurrence: 'fixed',
    });

    await expect(
      caller.incomes.upsert({
        id: income.id,
        snapshotId: snap2.id,
        name: 'Salary',
        amount: 500000,
        category: 'Employment',
        recurrence: 'none',
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
      recurrence: 'fixed',
    });

    const full = await caller.snapshots.get({ id: snap.id });
    expect(full.incomes).toHaveLength(1);
    expect(full.incomes[0].name).toBe('Salary');
    expect(full.incomes[0].recurrence).toBe('fixed');
  });

  test('upsert accepts the variable recurrence kind and returns it', async () => {
    const { caller } = makeTestCaller();
    const snap = await caller.snapshots.create({ year: 2026, month: 1 });

    const income = await caller.incomes.upsert({
      snapshotId: snap.id,
      name: 'Freelance',
      amount: 80000,
      category: 'Muu',
      recurrence: 'variable',
    });

    expect(income.recurrence).toBe('variable');
  });

  test('upsert rejects an unknown recurrence value', async () => {
    const { caller } = makeTestCaller();
    const snap = await caller.snapshots.create({ year: 2026, month: 1 });

    await expect(
      caller.incomes.upsert({
        snapshotId: snap.id,
        name: 'Salary',
        amount: 500000,
        category: 'Employment',
        // @ts-expect-error — invalid recurrence kind must be rejected by the validator
        recurrence: 'monthly',
      })
    ).rejects.toThrow();
  });

  test('upsert rejects the old boolean recurring shape', async () => {
    const { caller } = makeTestCaller();
    const snap = await caller.snapshots.create({ year: 2026, month: 1 });

    await expect(
      caller.incomes.upsert({
        snapshotId: snap.id,
        name: 'Salary',
        amount: 500000,
        category: 'Employment',
        // @ts-expect-error — the boolean `recurring` field no longer exists; `recurrence` is required
        recurring: true,
      })
    ).rejects.toThrow();
  });

  // ── Carried amount: server-managed, read-only to the client ────────────────

  test('a hand-created income has a null carried_amount and reads it back', async () => {
    const { caller } = makeTestCaller();
    const snap = await caller.snapshots.create({ year: 2026, month: 1 });

    const created = await caller.incomes.upsert({
      snapshotId: snap.id,
      name: 'Freelance',
      amount: 80000,
      category: 'Muu',
      recurrence: 'variable',
    });
    expect(created.carried_amount).toBeNull();

    const full = await caller.snapshots.get({ id: snap.id });
    expect(full.incomes[0].carried_amount).toBeNull();
  });

  test('upsert ignores a client-supplied carried_amount', async () => {
    const { caller } = makeTestCaller();
    const snap = await caller.snapshots.create({ year: 2026, month: 1 });

    const created = await caller.incomes.upsert({
      snapshotId: snap.id,
      name: 'Freelance',
      amount: 80000,
      category: 'Muu',
      recurrence: 'variable',
      // @ts-expect-error — carried_amount is server-managed and not part of the input
      carried_amount: 999999,
    });
    expect(created.carried_amount).toBeNull();
  });

  test('a carried income keeps its carried_amount through edits', async () => {
    const { caller } = makeTestCaller();
    const jan = await caller.snapshots.create({ year: 2026, month: 1 });
    await caller.incomes.upsert({
      snapshotId: jan.id,
      name: 'Freelance',
      amount: 80000,
      category: 'Muu',
      recurrence: 'variable',
    });

    // Feb carry-forward stamps carried_amount = 80000, amount 0.
    const feb = await caller.snapshots.create({ year: 2026, month: 2 });
    const febFull = await caller.snapshots.get({ id: feb.id });
    const carried = febFull.incomes[0];
    expect(carried.carried_amount).toBe(80000);

    const updated = await caller.incomes.upsert({
      id: carried.id,
      snapshotId: feb.id,
      name: 'Consulting',
      amount: 30000,
      category: 'Muu',
      recurrence: 'fixed',
    });
    expect(updated.carried_amount).toBe(80000);
    expect(updated.name).toBe('Consulting');
    expect(updated.amount).toBe(30000);
    expect(updated.recurrence).toBe('fixed');
  });
});

describe('incomes reorder', () => {
  test('reorder applies the given order', async () => {
    const { caller } = makeTestCaller();
    const snap = await caller.snapshots.create({ year: 2026, month: 1 });
    const ids: number[] = [];
    for (const name of ['A', 'B', 'C']) {
      const inc = await caller.incomes.upsert({ snapshotId: snap.id, name, amount: 1000, category: 'x', recurrence: 'none' });
      ids.push(inc.id);
    }
    const reordered = [ids[2], ids[0], ids[1]];

    await caller.incomes.reorder({ snapshotId: snap.id, orderedIds: reordered });

    const full = await caller.snapshots.get({ id: snap.id });
    expect(full.incomes.map((i) => i.id)).toEqual(reordered);
  });

  test('reorder of an empty list is a no-op', async () => {
    const { caller } = makeTestCaller();
    const snap = await caller.snapshots.create({ year: 2026, month: 1 });
    await caller.incomes.reorder({ snapshotId: snap.id, orderedIds: [] });
    const full = await caller.snapshots.get({ id: snap.id });
    expect(full.incomes).toEqual([]);
  });

  test('reorder of a single income is a no-op', async () => {
    const { caller } = makeTestCaller();
    const snap = await caller.snapshots.create({ year: 2026, month: 1 });
    const inc = await caller.incomes.upsert({ snapshotId: snap.id, name: 'Solo', amount: 1000, category: 'x', recurrence: 'none' });
    await caller.incomes.reorder({ snapshotId: snap.id, orderedIds: [inc.id] });
    const full = await caller.snapshots.get({ id: snap.id });
    expect(full.incomes.map((i) => i.id)).toEqual([inc.id]);
  });

  test('reorder rejects when an id is missing', async () => {
    const { caller } = makeTestCaller();
    const snap = await caller.snapshots.create({ year: 2026, month: 1 });
    const ids: number[] = [];
    for (const name of ['A', 'B', 'C']) {
      const inc = await caller.incomes.upsert({ snapshotId: snap.id, name, amount: 1000, category: 'x', recurrence: 'none' });
      ids.push(inc.id);
    }
    await expect(
      caller.incomes.reorder({ snapshotId: snap.id, orderedIds: ids.slice(1) })
    ).rejects.toThrow();
  });

  test('a newly created income is appended last after a reorder', async () => {
    const { caller } = makeTestCaller();
    const snap = await caller.snapshots.create({ year: 2026, month: 1 });
    const ids: number[] = [];
    for (const name of ['A', 'B', 'C']) {
      const inc = await caller.incomes.upsert({ snapshotId: snap.id, name, amount: 1000, category: 'x', recurrence: 'none' });
      ids.push(inc.id);
    }
    await caller.incomes.reorder({ snapshotId: snap.id, orderedIds: [ids[2], ids[1], ids[0]] });
    const added = await caller.incomes.upsert({ snapshotId: snap.id, name: 'D', amount: 1000, category: 'x', recurrence: 'none' });

    const full = await caller.snapshots.get({ id: snap.id });
    expect(full.incomes.map((i) => i.id)).toEqual([ids[2], ids[1], ids[0], added.id]);
  });
});
