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

describe('accounts router', () => {
  test('upsert creates a new account when no id is provided', async () => {
    const { caller } = makeTestCaller();
    const snap = await caller.snapshots.create({ year: 2026, month: 1 });

    const account = await caller.accounts.upsert({
      snapshotId: snap.id,
      name: 'Savings Account',
      type: 'asset',
      category: 'cash',
      balance: 150000,
    });

    expect(account.id).toBeGreaterThan(0);
    expect(account.name).toBe('Savings Account');
    expect(account.balance).toBe(150000);
    expect(account.type).toBe('asset');
  });

  test('upsert updates an existing account when id is provided', async () => {
    const { caller } = makeTestCaller();
    const snap = await caller.snapshots.create({ year: 2026, month: 1 });
    const full = await caller.snapshots.get({ id: snap.id });
    const existing = full.accounts[0];

    const updated = await caller.accounts.upsert({
      id: existing.id,
      snapshotId: snap.id,
      name: existing.name,
      type: existing.type as 'asset' | 'liability',
      category: existing.category,
      balance: 9999,
    });

    expect(updated.id).toBe(existing.id);
    expect(updated.balance).toBe(9999);
  });

  test('updated_at advances when an account is created', async () => {
    const { caller, db } = makeTestCaller();
    db.run(
      "INSERT INTO snapshots (year, month, created_at, updated_at) VALUES (2026, 5, datetime('now', '-1 hour'), datetime('now', '-1 hour'))"
    );
    const snapId = db.query<{ id: number }, []>('SELECT last_insert_rowid() as id').get()!.id;
    const before = db
      .query<{ updated_at: string }, [number]>('SELECT updated_at FROM snapshots WHERE id = ?')
      .get(snapId)!.updated_at;

    await caller.accounts.upsert({
      snapshotId: snapId,
      name: 'New Account',
      type: 'asset',
      category: 'cash',
      balance: 0,
    });

    const after = db
      .query<{ updated_at: string }, [number]>('SELECT updated_at FROM snapshots WHERE id = ?')
      .get(snapId)!.updated_at;
    expect(after > before).toBe(true);
  });

  test('updated_at advances when an account is deleted', async () => {
    const { caller, db } = makeTestCaller();
    db.run(
      "INSERT INTO snapshots (year, month, created_at, updated_at) VALUES (2026, 6, datetime('now', '-1 hour'), datetime('now', '-1 hour'))"
    );
    const snapId = db.query<{ id: number }, []>('SELECT last_insert_rowid() as id').get()!.id;
    db.run(
      'INSERT INTO accounts (snapshot_id, name, type, category, balance) VALUES (?, ?, ?, ?, ?)',
      [snapId, 'Test Account', 'asset', 'cash', 0]
    );
    const accountId = db.query<{ id: number }, []>('SELECT last_insert_rowid() as id').get()!.id;

    const before = db
      .query<{ updated_at: string }, [number]>('SELECT updated_at FROM snapshots WHERE id = ?')
      .get(snapId)!.updated_at;

    await caller.accounts.delete({ id: accountId, snapshotId: snapId });

    const after = db
      .query<{ updated_at: string }, [number]>('SELECT updated_at FROM snapshots WHERE id = ?')
      .get(snapId)!.updated_at;
    expect(after > before).toBe(true);
  });

  test('upsert rejects negative balance', async () => {
    const { caller } = makeTestCaller();
    const snap = await caller.snapshots.create({ year: 2026, month: 1 });
    await expect(
      caller.accounts.upsert({
        snapshotId: snap.id,
        name: 'Savings',
        type: 'asset',
        category: 'cash',
        balance: -1,
      })
    ).rejects.toThrow();
  });

  test('upsert rejects empty name', async () => {
    const { caller } = makeTestCaller();
    const snap = await caller.snapshots.create({ year: 2026, month: 1 });
    await expect(
      caller.accounts.upsert({
        snapshotId: snap.id,
        name: '',
        type: 'asset',
        category: 'cash',
        balance: 0,
      })
    ).rejects.toThrow();
  });

  test('upsert rejects name over 100 characters', async () => {
    const { caller } = makeTestCaller();
    const snap = await caller.snapshots.create({ year: 2026, month: 1 });
    await expect(
      caller.accounts.upsert({
        snapshotId: snap.id,
        name: 'a'.repeat(101),
        type: 'asset',
        category: 'cash',
        balance: 0,
      })
    ).rejects.toThrow();
  });

  test('delete returns not-found for unknown account id', async () => {
    const { caller } = makeTestCaller();
    const snap = await caller.snapshots.create({ year: 2026, month: 1 });
    await expect(
      caller.accounts.delete({ id: 999999, snapshotId: snap.id })
    ).rejects.toThrow();
  });

  test('upsert update rejects account belonging to a different snapshot (A1)', async () => {
    const { caller } = makeTestCaller();
    const snap1 = await caller.snapshots.create({ year: 2026, month: 1 });
    const snap2 = await caller.snapshots.create({ year: 2026, month: 2 });
    const full1 = await caller.snapshots.get({ id: snap1.id });
    const account = full1.accounts[0]; // owned by snap1

    await expect(
      caller.accounts.upsert({
        id: account.id,
        snapshotId: snap2.id, // wrong snapshot — should be rejected
        name: account.name,
        type: account.type as 'asset' | 'liability',
        category: account.category,
        balance: 9999,
      })
    ).rejects.toThrow();
  });

  test('delete rejects account belonging to a different snapshot (A2)', async () => {
    const { caller } = makeTestCaller();
    const snap1 = await caller.snapshots.create({ year: 2026, month: 1 });
    const snap2 = await caller.snapshots.create({ year: 2026, month: 2 });
    const full1 = await caller.snapshots.get({ id: snap1.id });
    const account = full1.accounts[0]; // owned by snap1

    await expect(
      caller.accounts.delete({ id: account.id, snapshotId: snap2.id }) // wrong snapshot
    ).rejects.toThrow();
  });

  test('upsert create returns NOT_FOUND for non-existent snapshot (A3)', async () => {
    const { caller } = makeTestCaller();
    await expect(
      caller.accounts.upsert({
        snapshotId: 999999,
        name: 'Ghost Account',
        type: 'asset',
        category: 'cash',
        balance: 0,
      })
    ).rejects.toThrow();
  });

  test('delete returns the deleted account entity (B4)', async () => {
    const { caller } = makeTestCaller();
    const snap = await caller.snapshots.create({ year: 2026, month: 1 });
    const full = await caller.snapshots.get({ id: snap.id });
    const account = full.accounts[0];

    const result = await caller.accounts.delete({ id: account.id, snapshotId: snap.id });
    expect(result.id).toBe(account.id);
    expect(result.name).toBe(account.name);
  });

  test('upsert rejects whitespace-only name (C1)', async () => {
    const { caller } = makeTestCaller();
    const snap = await caller.snapshots.create({ year: 2026, month: 1 });
    await expect(
      caller.accounts.upsert({
        snapshotId: snap.id,
        name: '   ',
        type: 'asset',
        category: 'cash',
        balance: 0,
      })
    ).rejects.toThrow();
  });

  test('upsert rejects negative totalPaid (C2)', async () => {
    const { caller } = makeTestCaller();
    const snap = await caller.snapshots.create({ year: 2026, month: 1 });
    await expect(
      caller.accounts.upsert({
        snapshotId: snap.id,
        name: 'Mortgage',
        type: 'liability',
        category: 'debt',
        balance: 0,
        totalPaid: -1,
      })
    ).rejects.toThrow();
  });

  test('upsert trims whitespace from name and category before saving (C3)', async () => {
    const { caller } = makeTestCaller();
    const snap = await caller.snapshots.create({ year: 2026, month: 1 });
    const account = await caller.accounts.upsert({
      snapshotId: snap.id,
      name: '  Savings  ',
      type: 'asset',
      category: '  cash  ',
      balance: 0,
    });
    expect(account.name).toBe('Savings');
    expect(account.category).toBe('cash');
  });

  test('upsert rejects empty category (C4)', async () => {
    const { caller } = makeTestCaller();
    const snap = await caller.snapshots.create({ year: 2026, month: 1 });
    await expect(
      caller.accounts.upsert({
        snapshotId: snap.id,
        name: 'Savings',
        type: 'asset',
        category: '',
        balance: 0,
      })
    ).rejects.toThrow();
  });

  test('upsert rejects category over 100 characters (C4)', async () => {
    const { caller } = makeTestCaller();
    const snap = await caller.snapshots.create({ year: 2026, month: 1 });
    await expect(
      caller.accounts.upsert({
        snapshotId: snap.id,
        name: 'Savings',
        type: 'asset',
        category: 'a'.repeat(101),
        balance: 0,
      })
    ).rejects.toThrow();
  });

  test('updated_at advances on account update (C6)', async () => {
    const { caller, db } = makeTestCaller();
    db.run(
      "INSERT INTO snapshots (year, month, created_at, updated_at) VALUES (2026, 7, datetime('now', '-1 hour'), datetime('now', '-1 hour'))"
    );
    const snapId = db.query<{ id: number }, []>('SELECT last_insert_rowid() as id').get()!.id;
    db.run(
      'INSERT INTO accounts (snapshot_id, name, type, category, balance) VALUES (?, ?, ?, ?, ?)',
      [snapId, 'Test', 'asset', 'cash', 0]
    );
    const accountId = db.query<{ id: number }, []>('SELECT last_insert_rowid() as id').get()!.id;

    const before = db
      .query<{ updated_at: string }, [number]>('SELECT updated_at FROM snapshots WHERE id = ?')
      .get(snapId)!.updated_at;

    await caller.accounts.upsert({
      id: accountId,
      snapshotId: snapId,
      name: 'Updated Name',
      type: 'asset',
      category: 'cash',
      balance: 50000,
    });

    const after = db
      .query<{ updated_at: string }, [number]>('SELECT updated_at FROM snapshots WHERE id = ?')
      .get(snapId)!.updated_at;
    expect(after > before).toBe(true);
  });
});
