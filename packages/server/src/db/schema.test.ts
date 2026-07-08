import { describe, test, expect, beforeEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runMigrations } from './schema';

function makeDb() {
  const db = new Database(':memory:');
  runMigrations(db);
  return db;
}

const migrationsDir = join(import.meta.dir, 'migrations');

// Build the pre-migration-3 database state: apply migrations 1 and 2 from their
// SQL files and record them as applied, so a later runMigrations(db) call runs
// only migration 3 — exactly the upgrade path a real database follows.
function makeDbAtMigration2(): Database {
  const db = new Database(':memory:');
  db.run('PRAGMA foreign_keys = ON');
  db.run(`
    CREATE TABLE migrations (
      id         INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    )
  `);
  for (const id of [1, 2]) {
    const sql = readFileSync(join(migrationsDir, `migration_${id}.sql`), 'utf-8');
    db.transaction(() => {
      db.exec(sql);
      db.run('INSERT INTO migrations (id) VALUES (?)', [id]);
    })();
  }
  return db;
}

describe('schema', () => {
  test('creates all tables without error', () => {
    const db = makeDb();
    const tables = db
      .query<{ name: string }, []>(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`)
      .all()
      .map((r) => r.name);

    expect(tables).toContain('snapshots');
    expect(tables).toContain('accounts');
    expect(tables).toContain('expense_categories');
    expect(tables).toContain('expenses');
    expect(tables).toContain('incomes');
    expect(tables).toContain('migrations');
  });

  test('records migration_1 in migrations table', () => {
    const db = makeDb();
    const row = db.query<{ id: number; applied_at: string }, []>('SELECT id, applied_at FROM migrations').get();
    expect(row?.id).toBe(1);
    expect(typeof row?.applied_at).toBe('string');
  });

  test('does not re-run migrations on second call', () => {
    const db = makeDb();
    const before = db.query<{ n: number }, []>('SELECT COUNT(*) as n FROM migrations').get()!.n;
    runMigrations(db); // second call — should be a no-op
    const after = db.query<{ n: number }, []>('SELECT COUNT(*) as n FROM migrations').get()!.n;
    expect(after).toBe(before);
  });

  test('migration files sort in numeric not lexicographic order', () => {
    const files = ['migration_10.sql', 'migration_2.sql', 'migration_9.sql', 'migration_1.sql'];
    const getId = (f: string) => parseInt(f.match(/^migration_(\d+)\.sql$/)![1]);
    const sorted = [...files].sort((a, b) => getId(a) - getId(b));
    expect(sorted).toEqual(['migration_1.sql', 'migration_2.sql', 'migration_9.sql', 'migration_10.sql']);
  });

  test('failed migration SQL rolls back the migration record', () => {
    const db = makeDb();
    expect(() => {
      db.transaction(() => {
        db.exec('THIS IS NOT VALID SQL!!!');
        db.run('INSERT INTO migrations (id) VALUES (?)', [99]);
      })();
    }).toThrow();
    const recorded = db.query<{ id: number }, []>('SELECT id FROM migrations WHERE id = 99').get();
    expect(recorded).toBeNull();
  });

  test('enforces UNIQUE(year, month) on snapshots', () => {
    const db = makeDb();
    db.run('INSERT INTO snapshots (year, month) VALUES (2026, 1)');
    expect(() => db.run('INSERT INTO snapshots (year, month) VALUES (2026, 1)')).toThrow();
  });

  test('rejects month = 0 via CHECK constraint', () => {
    const db = makeDb();
    expect(() => db.run('INSERT INTO snapshots (year, month) VALUES (2026, 0)')).toThrow();
  });

  test('rejects month = 13 via CHECK constraint', () => {
    const db = makeDb();
    expect(() => db.run('INSERT INTO snapshots (year, month) VALUES (2026, 13)')).toThrow();
  });

  test('CASCADE delete snapshot removes all children', () => {
    const db = makeDb();
    db.run('INSERT INTO snapshots (year, month) VALUES (2026, 1)');
    const snap = db.query<{ id: number }, []>('SELECT last_insert_rowid() as id').get()!;
    const snapId = snap.id;

    db.run('INSERT INTO accounts (snapshot_id, name, type, category, balance) VALUES (?, ?, ?, ?, ?)', [
      snapId, 'Cash', 'asset', 'cash', 0,
    ]);
    db.run('INSERT INTO expense_categories (snapshot_id, name, parent_id) VALUES (?, ?, NULL)', [snapId, 'Housing']);
    const cat = db.query<{ id: number }, []>('SELECT last_insert_rowid() as id').get()!;
    db.run('INSERT INTO expenses (snapshot_id, name, amount, category_id, recurrence) VALUES (?, ?, ?, ?, ?)', [
      snapId, 'Rent', 100000, cat.id, 'none',
    ]);
    db.run('INSERT INTO incomes (snapshot_id, name, amount, category, recurrence) VALUES (?, ?, ?, ?, ?)', [
      snapId, 'Salary', 500000, 'Salary', 'none',
    ]);

    db.run('DELETE FROM snapshots WHERE id = ?', [snapId]);

    expect(db.query<{ n: number }, []>('SELECT COUNT(*) as n FROM accounts').get()!.n).toBe(0);
    expect(db.query<{ n: number }, []>('SELECT COUNT(*) as n FROM expense_categories').get()!.n).toBe(0);
    expect(db.query<{ n: number }, []>('SELECT COUNT(*) as n FROM expenses').get()!.n).toBe(0);
    expect(db.query<{ n: number }, []>('SELECT COUNT(*) as n FROM incomes').get()!.n).toBe(0);
  });

  test('CASCADE delete expense_category removes descendant categories', () => {
    const db = makeDb();
    db.run('INSERT INTO snapshots (year, month) VALUES (2026, 1)');
    const snap = db.query<{ id: number }, []>('SELECT last_insert_rowid() as id').get()!;
    const snapId = snap.id;

    db.run('INSERT INTO expense_categories (snapshot_id, name, parent_id) VALUES (?, ?, NULL)', [snapId, 'Parent']);
    const parent = db.query<{ id: number }, []>('SELECT last_insert_rowid() as id').get()!;
    db.run('INSERT INTO expense_categories (snapshot_id, name, parent_id) VALUES (?, ?, ?)', [snapId, 'Child1', parent.id]);
    db.run('INSERT INTO expense_categories (snapshot_id, name, parent_id) VALUES (?, ?, ?)', [snapId, 'Child2', parent.id]);

    expect(db.query<{ n: number }, []>('SELECT COUNT(*) as n FROM expense_categories').get()!.n).toBe(3);
    db.run('DELETE FROM expense_categories WHERE id = ?', [parent.id]);
    expect(db.query<{ n: number }, []>('SELECT COUNT(*) as n FROM expense_categories').get()!.n).toBe(0);
  });

  test('CASCADE delete expense_category removes expenses', () => {
    const db = makeDb();
    db.run('INSERT INTO snapshots (year, month) VALUES (2026, 1)');
    const snap = db.query<{ id: number }, []>('SELECT last_insert_rowid() as id').get()!;
    const snapId = snap.id;

    db.run('INSERT INTO expense_categories (snapshot_id, name, parent_id) VALUES (?, ?, NULL)', [snapId, 'Housing']);
    const cat = db.query<{ id: number }, []>('SELECT last_insert_rowid() as id').get()!;
    db.run('INSERT INTO expenses (snapshot_id, name, amount, category_id, recurrence) VALUES (?, ?, ?, ?, ?)', [
      snapId, 'Rent', 100000, cat.id, 'none',
    ]);
    db.run('INSERT INTO expenses (snapshot_id, name, amount, category_id, recurrence) VALUES (?, ?, ?, ?, ?)', [
      snapId, 'Internet', 5000, cat.id, 'none',
    ]);

    expect(db.query<{ n: number }, []>('SELECT COUNT(*) as n FROM expenses').get()!.n).toBe(2);
    db.run('DELETE FROM expense_categories WHERE id = ?', [cat.id]);
    expect(db.query<{ n: number }, []>('SELECT COUNT(*) as n FROM expenses').get()!.n).toBe(0);
  });
});

describe('migration_3 — tri-state recurrence backfill', () => {
  // Seed a legacy snapshot with a category and legacy `recurring` rows on both
  // expenses and incomes, then run migration 3 and return the ids for asserting.
  function seedLegacyRows(db: Database): { snapId: number; catId: number } {
    db.run('INSERT INTO snapshots (year, month) VALUES (2026, 1)');
    const snapId = Number(db.query<{ id: number }, []>('SELECT last_insert_rowid() as id').get()!.id);
    db.run('INSERT INTO expense_categories (snapshot_id, name, parent_id) VALUES (?, ?, NULL)', [snapId, 'Housing']);
    const catId = Number(db.query<{ id: number }, []>('SELECT last_insert_rowid() as id').get()!.id);
    db.run('INSERT INTO expenses (snapshot_id, name, amount, category_id, recurring) VALUES (?, ?, ?, ?, ?)', [snapId, 'Rent', 100000, catId, 1]);
    db.run('INSERT INTO expenses (snapshot_id, name, amount, category_id, recurring) VALUES (?, ?, ?, ?, ?)', [snapId, 'Vacation', 50000, catId, 0]);
    db.run('INSERT INTO incomes (snapshot_id, name, amount, category, recurring) VALUES (?, ?, ?, ?, ?)', [snapId, 'Salary', 500000, 'Palkka', 1]);
    db.run('INSERT INTO incomes (snapshot_id, name, amount, category, recurring) VALUES (?, ?, ?, ?, ?)', [snapId, 'Bonus', 100000, 'Bonus', 0]);
    return { snapId, catId };
  }

  test('backfills recurring=1 → fixed and 0 → none on both tables', () => {
    const db = makeDbAtMigration2();
    seedLegacyRows(db);

    runMigrations(db); // applies only migration 3

    const expenses = db
      .query<{ name: string; recurrence: string }, []>('SELECT name, recurrence FROM expenses ORDER BY name')
      .all();
    expect(expenses).toEqual([
      { name: 'Rent', recurrence: 'fixed' },
      { name: 'Vacation', recurrence: 'none' },
    ]);

    const incomes = db
      .query<{ name: string; recurrence: string }, []>('SELECT name, recurrence FROM incomes ORDER BY name')
      .all();
    expect(incomes).toEqual([
      { name: 'Bonus', recurrence: 'none' },
      { name: 'Salary', recurrence: 'fixed' },
    ]);
  });

  test('drops the old recurring column from both tables', () => {
    const db = makeDbAtMigration2();
    seedLegacyRows(db);
    runMigrations(db);

    for (const table of ['expenses', 'incomes']) {
      const cols = db
        .query<{ name: string }, []>(`PRAGMA table_info(${table})`)
        .all()
        .map((c) => c.name);
      expect(cols).toContain('recurrence');
      expect(cols).not.toContain('recurring');
    }
  });

  test('records migration 3 as applied', () => {
    const db = makeDbAtMigration2();
    runMigrations(db);
    const ids = db.query<{ id: number }, []>('SELECT id FROM migrations ORDER BY id').all().map((r) => r.id);
    expect(ids).toEqual([1, 2, 3]);
  });

  test('rejects a recurrence value outside the three kinds (CHECK)', () => {
    const db = makeDbAtMigration2();
    const { snapId, catId } = seedLegacyRows(db);
    runMigrations(db);

    expect(() =>
      db.run('INSERT INTO expenses (snapshot_id, name, amount, category_id, recurrence) VALUES (?, ?, ?, ?, ?)', [
        snapId, 'Bad', 100, catId, 'weekly',
      ])
    ).toThrow();
    expect(() =>
      db.run('INSERT INTO incomes (snapshot_id, name, amount, category, recurrence) VALUES (?, ?, ?, ?, ?)', [
        snapId, 'Bad', 100, 'x', 'monthly',
      ])
    ).toThrow();
  });
});
