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

describe('dashboard router', () => {
  test('summary returns empty array when no snapshots', async () => {
    const { caller } = makeTestCaller();
    const result = await caller.dashboard.summary();
    expect(result).toEqual([]);
  });

  test('summary returns snapshot with computed net worth', async () => {
    const { caller, db } = makeTestCaller();
    const snap = await caller.snapshots.create({ year: 2026, month: 1 });

    db.run('DELETE FROM accounts WHERE snapshot_id = ?', [snap.id]);
    db.run(
      'INSERT INTO accounts (snapshot_id, name, type, category, balance, total_paid) VALUES (?, ?, ?, ?, ?, ?)',
      [snap.id, 'Bank', 'asset', 'cash', 200000, null]
    );
    db.run(
      'INSERT INTO accounts (snapshot_id, name, type, category, balance, total_paid) VALUES (?, ?, ?, ?, ?, ?)',
      [snap.id, 'Loan', 'liability', 'debt', 50000, null]
    );

    const result = await caller.dashboard.summary();
    expect(result).toHaveLength(1);
    expect(result[0].netWorth).toBe(150000);
  });

  test('summary first snapshot has null previousNetWorth and null delta', async () => {
    const { caller } = makeTestCaller();
    await caller.snapshots.create({ year: 2026, month: 1 });

    const result = await caller.dashboard.summary();
    expect(result[0].previousNetWorth).toBeNull();
    expect(result[0].delta).toBeNull();
  });

  test('summary returns net worth delta vs previous snapshot', async () => {
    const { caller, db } = makeTestCaller();
    const snap1 = await caller.snapshots.create({ year: 2026, month: 1 });
    const snap2 = await caller.snapshots.create({ year: 2026, month: 2 });

    db.run('DELETE FROM accounts WHERE snapshot_id = ?', [snap1.id]);
    db.run('DELETE FROM accounts WHERE snapshot_id = ?', [snap2.id]);

    db.run(
      'INSERT INTO accounts (snapshot_id, name, type, category, balance, total_paid) VALUES (?, ?, ?, ?, ?, ?)',
      [snap1.id, 'Bank', 'asset', 'cash', 100000, null]
    );
    db.run(
      'INSERT INTO accounts (snapshot_id, name, type, category, balance, total_paid) VALUES (?, ?, ?, ?, ?, ?)',
      [snap2.id, 'Bank', 'asset', 'cash', 130000, null]
    );

    const result = await caller.dashboard.summary();
    // result is ordered DESC so snap2 is first
    const snap2Summary = result.find((s) => s.id === snap2.id)!;
    expect(snap2Summary.delta).toBe(30000);
    expect(snap2Summary.previousNetWorth).toBe(100000);
  });

  test('summary delta dynamically resolves — delete middle snapshot, last diffs vs first', async () => {
    const { caller, db } = makeTestCaller();
    const snap1 = await caller.snapshots.create({ year: 2026, month: 1 });
    const snap2 = await caller.snapshots.create({ year: 2026, month: 2 });
    const snap3 = await caller.snapshots.create({ year: 2026, month: 3 });

    db.run('DELETE FROM accounts WHERE snapshot_id = ?', [snap1.id]);
    db.run('DELETE FROM accounts WHERE snapshot_id = ?', [snap2.id]);
    db.run('DELETE FROM accounts WHERE snapshot_id = ?', [snap3.id]);

    db.run(
      'INSERT INTO accounts (snapshot_id, name, type, category, balance, total_paid) VALUES (?, ?, ?, ?, ?, ?)',
      [snap1.id, 'Bank', 'asset', 'cash', 100000, null]
    );
    db.run(
      'INSERT INTO accounts (snapshot_id, name, type, category, balance, total_paid) VALUES (?, ?, ?, ?, ?, ?)',
      [snap2.id, 'Bank', 'asset', 'cash', 150000, null]
    );
    db.run(
      'INSERT INTO accounts (snapshot_id, name, type, category, balance, total_paid) VALUES (?, ?, ?, ?, ?, ?)',
      [snap3.id, 'Bank', 'asset', 'cash', 200000, null]
    );

    const before = await caller.dashboard.summary();
    const snap3Before = before.find((s) => s.id === snap3.id)!;
    expect(snap3Before.delta).toBe(50000); // vs snap2

    await caller.snapshots.delete({ id: snap2.id });

    const after = await caller.dashboard.summary();
    const snap3After = after.find((s) => s.id === snap3.id)!;
    expect(snap3After.delta).toBe(100000); // now diffs vs snap1
  });

  test('summary snapshot has correct id, year, month fields', async () => {
    const { caller } = makeTestCaller();
    await caller.snapshots.create({ year: 2026, month: 3 });

    const result = await caller.dashboard.summary();
    expect(result[0].id).toBeGreaterThan(0);
    expect(result[0].year).toBe(2026);
    expect(result[0].month).toBe(3);
  });
});
