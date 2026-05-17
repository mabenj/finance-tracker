import { describe, test, expect, beforeEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { initDb } from '../db/schema';
import { appRouter } from './index';

function makeTestCaller() {
  const db = new Database(':memory:');
  initDb(db);
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
});
