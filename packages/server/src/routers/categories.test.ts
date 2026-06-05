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

describe('categories router', () => {
  test('create creates a top-level category', async () => {
    const { caller } = makeTestCaller();
    const snap = await caller.snapshots.create({ year: 2026, month: 1 });

    const cat = await caller.categories.create({
      snapshotId: snap.id,
      name: 'Housing',
    });

    expect(cat.id).toBeGreaterThan(0);
    expect(cat.name).toBe('Housing');
    expect(cat.parent_id).toBeNull();
  });

  test('create creates a child category', async () => {
    const { caller } = makeTestCaller();
    const snap = await caller.snapshots.create({ year: 2026, month: 1 });
    const parent = await caller.categories.create({ snapshotId: snap.id, name: 'Housing' });

    const child = await caller.categories.create({
      snapshotId: snap.id,
      name: 'Utilities',
      parentId: parent.id,
    });

    expect(child.parent_id).toBe(parent.id);
    expect(child.name).toBe('Utilities');
  });

  test('duplicate sibling name is rejected (same parent)', async () => {
    const { caller } = makeTestCaller();
    const snap = await caller.snapshots.create({ year: 2026, month: 1 });
    await caller.categories.create({ snapshotId: snap.id, name: 'Housing' });

    await expect(
      caller.categories.create({ snapshotId: snap.id, name: 'Housing' })
    ).rejects.toThrow();
  });

  test('same name is allowed at different depths', async () => {
    const { caller } = makeTestCaller();
    const snap = await caller.snapshots.create({ year: 2026, month: 1 });
    const parent = await caller.categories.create({ snapshotId: snap.id, name: 'Travel' });

    const child = await caller.categories.create({
      snapshotId: snap.id,
      name: 'Travel',
      parentId: parent.id,
    });

    expect(child.name).toBe('Travel');
    expect(child.parent_id).toBe(parent.id);
  });

  test('update renames a category', async () => {
    const { caller } = makeTestCaller();
    const snap = await caller.snapshots.create({ year: 2026, month: 1 });
    const cat = await caller.categories.create({ snapshotId: snap.id, name: 'Housing' });

    const updated = await caller.categories.update({
      id: cat.id,
      snapshotId: snap.id,
      name: 'Home',
    });

    expect(updated.id).toBe(cat.id);
    expect(updated.name).toBe('Home');
  });

  test('update rejects rename that conflicts with an existing sibling', async () => {
    const { caller } = makeTestCaller();
    const snap = await caller.snapshots.create({ year: 2026, month: 1 });
    await caller.categories.create({ snapshotId: snap.id, name: 'Housing' });
    const cat2 = await caller.categories.create({ snapshotId: snap.id, name: 'Services' });

    await expect(
      caller.categories.update({ id: cat2.id, snapshotId: snap.id, name: 'Housing' })
    ).rejects.toThrow();
  });

  test('deletePreview returns correct subcategory count, expense count, and total', async () => {
    const { caller, db } = makeTestCaller();
    const snap = await caller.snapshots.create({ year: 2026, month: 1 });
    const parent = await caller.categories.create({ snapshotId: snap.id, name: 'Housing' });
    const child = await caller.categories.create({
      snapshotId: snap.id,
      name: 'Utilities',
      parentId: parent.id,
    });

    // 2 expenses under parent, 1 under child
    db.run(
      'INSERT INTO expenses (snapshot_id, name, amount, category_id, recurring) VALUES (?, ?, ?, ?, ?)',
      [snap.id, 'Rent', 80000, parent.id, 0]
    );
    db.run(
      'INSERT INTO expenses (snapshot_id, name, amount, category_id, recurring) VALUES (?, ?, ?, ?, ?)',
      [snap.id, 'Insurance', 5000, parent.id, 0]
    );
    db.run(
      'INSERT INTO expenses (snapshot_id, name, amount, category_id, recurring) VALUES (?, ?, ?, ?, ?)',
      [snap.id, 'Electricity', 3000, child.id, 0]
    );

    const preview = await caller.categories.deletePreview({ id: parent.id, snapshotId: snap.id });

    expect(preview.subcategoryCount).toBe(1);
    expect(preview.expenseCount).toBe(3);
    expect(preview.totalAmount).toBe(88000);
  });

  test('deletePreview is idempotent — does not modify data', async () => {
    const { caller, db } = makeTestCaller();
    const snap = await caller.snapshots.create({ year: 2026, month: 1 });
    const cat = await caller.categories.create({ snapshotId: snap.id, name: 'Housing' });

    const before = db
      .query<{ count: number }, [number]>(
        'SELECT count(*) as count FROM expense_categories WHERE snapshot_id = ?'
      )
      .get(snap.id)!.count;

    await caller.categories.deletePreview({ id: cat.id, snapshotId: snap.id });

    const after = db
      .query<{ count: number }, [number]>(
        'SELECT count(*) as count FROM expense_categories WHERE snapshot_id = ?'
      )
      .get(snap.id)!.count;

    expect(after).toBe(before);
  });

  test('delete cascades to all descendants and their expenses', async () => {
    const { caller, db } = makeTestCaller();
    const snap = await caller.snapshots.create({ year: 2026, month: 1 });

    const root = await caller.categories.create({ snapshotId: snap.id, name: 'Root' });
    const child = await caller.categories.create({
      snapshotId: snap.id,
      name: 'Child',
      parentId: root.id,
    });
    const grandchild = await caller.categories.create({
      snapshotId: snap.id,
      name: 'Grandchild',
      parentId: child.id,
    });

    db.run(
      'INSERT INTO expenses (snapshot_id, name, amount, category_id, recurring) VALUES (?, ?, ?, ?, ?)',
      [snap.id, 'Root Expense', 1000, root.id, 0]
    );
    db.run(
      'INSERT INTO expenses (snapshot_id, name, amount, category_id, recurring) VALUES (?, ?, ?, ?, ?)',
      [snap.id, 'Child Expense', 2000, child.id, 0]
    );
    db.run(
      'INSERT INTO expenses (snapshot_id, name, amount, category_id, recurring) VALUES (?, ?, ?, ?, ?)',
      [snap.id, 'Grandchild Expense', 3000, grandchild.id, 0]
    );

    await caller.categories.delete({ id: root.id, snapshotId: snap.id });

    const catCount = db
      .query<{ count: number }, [number]>(
        'SELECT count(*) as count FROM expense_categories WHERE snapshot_id = ?'
      )
      .get(snap.id)!.count;
    const expCount = db
      .query<{ count: number }, [number]>(
        'SELECT count(*) as count FROM expenses WHERE snapshot_id = ?'
      )
      .get(snap.id)!.count;

    expect(catCount).toBe(0);
    expect(expCount).toBe(0);
  });

  test('delete returns the deleted category', async () => {
    const { caller } = makeTestCaller();
    const snap = await caller.snapshots.create({ year: 2026, month: 1 });
    const cat = await caller.categories.create({ snapshotId: snap.id, name: 'Housing' });

    const result = await caller.categories.delete({ id: cat.id, snapshotId: snap.id });
    expect(result.id).toBe(cat.id);
    expect(result.name).toBe('Housing');
  });

  test('snapshots.get returns the category tree', async () => {
    const { caller } = makeTestCaller();
    const snap = await caller.snapshots.create({ year: 2026, month: 1 });
    await caller.categories.create({ snapshotId: snap.id, name: 'Housing' });

    const full = await caller.snapshots.get({ id: snap.id });
    expect(full.categories).toHaveLength(1);
    expect(full.categories[0].name).toBe('Housing');
    expect(full.categories[0].parent_id).toBeNull();
  });

  test('updated_at advances on category create', async () => {
    const { caller, db } = makeTestCaller();
    db.run(
      "INSERT INTO snapshots (year, month, created_at, updated_at) VALUES (2026, 5, datetime('now', '-1 hour'), datetime('now', '-1 hour'))"
    );
    const snapId = db.query<{ id: number }, []>('SELECT last_insert_rowid() as id').get()!.id;
    const before = db
      .query<{ updated_at: string }, [number]>('SELECT updated_at FROM snapshots WHERE id = ?')
      .get(snapId)!.updated_at;

    await caller.categories.create({ snapshotId: snapId, name: 'Housing' });

    const after = db
      .query<{ updated_at: string }, [number]>('SELECT updated_at FROM snapshots WHERE id = ?')
      .get(snapId)!.updated_at;
    expect(after > before).toBe(true);
  });

  test('create rejects non-existent snapshot', async () => {
    const { caller } = makeTestCaller();
    await expect(
      caller.categories.create({ snapshotId: 999999, name: 'Housing' })
    ).rejects.toThrow();
  });

  test('deletePreview returns zeros for a leaf with no expenses', async () => {
    const { caller } = makeTestCaller();
    const snap = await caller.snapshots.create({ year: 2026, month: 1 });
    const cat = await caller.categories.create({ snapshotId: snap.id, name: 'Empty' });

    const preview = await caller.categories.deletePreview({ id: cat.id, snapshotId: snap.id });
    expect(preview.subcategoryCount).toBe(0);
    expect(preview.expenseCount).toBe(0);
    expect(preview.totalAmount).toBe(0);
  });
});
