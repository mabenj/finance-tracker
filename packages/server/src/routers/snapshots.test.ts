import { describe, test, expect, beforeEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { appRouter } from './index';

function makeTestCaller() {
  const db = new Database(':memory:');
  runMigrations(db);
  return appRouter.createCaller({ db });
}

describe('snapshots router', () => {
  test('list returns empty array when no snapshots exist', async () => {
    const caller = makeTestCaller();
    const result = await caller.snapshots.list();
    expect(result).toEqual([]);
  });

  test('create returns snapshot with 8 default accounts on first create', async () => {
    const caller = makeTestCaller();
    const snap = await caller.snapshots.create({ year: 2026, month: 1 });
    expect(snap.year).toBe(2026);
    expect(snap.month).toBe(1);
    expect(snap.id).toBeGreaterThan(0);

    const full = await caller.snapshots.get({ id: snap.id });
    expect(full.accounts).toHaveLength(8);
  });

  test('create rejects duplicate month', async () => {
    const caller = makeTestCaller();
    await caller.snapshots.create({ year: 2026, month: 1 });
    await expect(caller.snapshots.create({ year: 2026, month: 1 })).rejects.toThrow();
  });

  test('delete removes snapshot; list is empty after', async () => {
    const caller = makeTestCaller();
    const snap = await caller.snapshots.create({ year: 2026, month: 1 });
    await caller.snapshots.delete({ id: snap.id });
    const list = await caller.snapshots.list();
    expect(list).toHaveLength(0);
  });

  test('get resolves previousSnapshot dynamically', async () => {
    const caller = makeTestCaller();
    const jan = await caller.snapshots.create({ year: 2026, month: 1 });
    const mar = await caller.snapshots.create({ year: 2026, month: 3 });

    const marFull = await caller.snapshots.get({ id: mar.id });
    expect(marFull.previousSnapshot).not.toBeNull();
    expect(marFull.previousSnapshot!.id).toBe(jan.id);
  });

  test('get returns null previousSnapshot for first snapshot', async () => {
    const caller = makeTestCaller();
    const snap = await caller.snapshots.create({ year: 2026, month: 1 });
    const full = await caller.snapshots.get({ id: snap.id });
    expect(full.previousSnapshot).toBeNull();
  });

  test('get re-resolves previousSnapshot after middle snapshot is deleted (C5 / §3.1)', async () => {
    const caller = makeTestCaller();
    const jan = await caller.snapshots.create({ year: 2026, month: 1 });
    const feb = await caller.snapshots.create({ year: 2026, month: 2 });
    const mar = await caller.snapshots.create({ year: 2026, month: 3 });

    await caller.snapshots.delete({ id: feb.id });

    const marFull = await caller.snapshots.get({ id: mar.id });
    expect(marFull.previousSnapshot).not.toBeNull();
    expect(marFull.previousSnapshot!.id).toBe(jan.id);
  });

  test('get returns accounts ordered by position', async () => {
    const caller = makeTestCaller();
    const snap = await caller.snapshots.create({ year: 2026, month: 1 });
    let full = await caller.snapshots.get({ id: snap.id });
    const ids = full.accounts.map((a) => a.id);
    const reversed = [...ids].reverse();

    await caller.accounts.reorder({ snapshotId: snap.id, orderedIds: reversed });

    full = await caller.snapshots.get({ id: snap.id });
    expect(full.accounts.map((a) => a.id)).toEqual(reversed);
  });

  test('get returns previousSnapshot accounts ordered by position', async () => {
    const caller = makeTestCaller();
    const jan = await caller.snapshots.create({ year: 2026, month: 1 });
    const janFull = await caller.snapshots.get({ id: jan.id });
    const ids = janFull.accounts.map((a) => a.id);
    const reversed = [...ids].reverse();
    await caller.accounts.reorder({ snapshotId: jan.id, orderedIds: reversed });

    const feb = await caller.snapshots.create({ year: 2026, month: 2 });
    const febFull = await caller.snapshots.get({ id: feb.id });
    expect(febFull.previousSnapshot).not.toBeNull();
    expect(febFull.previousSnapshot!.accounts.map((a) => a.id)).toEqual(reversed);
  });
});
