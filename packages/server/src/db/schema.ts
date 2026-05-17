import type { Database } from 'bun:sqlite';

export function initDb(db: Database): void {
  db.run('PRAGMA foreign_keys = ON');

  db.run(`
    CREATE TABLE IF NOT EXISTS snapshots (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      year       INTEGER NOT NULL,
      month      INTEGER NOT NULL CHECK(month BETWEEN 1 AND 12),
      created_at TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(year, month)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS accounts (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      snapshot_id INTEGER NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
      name        TEXT    NOT NULL,
      type        TEXT    NOT NULL CHECK(type IN ('asset', 'liability')),
      category    TEXT    NOT NULL,
      balance     INTEGER NOT NULL DEFAULT 0 CHECK(balance >= 0),
      total_paid  INTEGER CHECK(total_paid >= 0)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS expense_categories (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      snapshot_id INTEGER NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
      name        TEXT    NOT NULL,
      parent_id   INTEGER REFERENCES expense_categories(id) ON DELETE CASCADE
    )
  `);

  // Separate partial indexes so NULL parent_id siblings are also caught
  // (SQLite treats NULLs as distinct in a plain UNIQUE constraint)
  db.run(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_top_level
    ON expense_categories(snapshot_id, name)
    WHERE parent_id IS NULL
  `);

  db.run(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_child
    ON expense_categories(snapshot_id, parent_id, name)
    WHERE parent_id IS NOT NULL
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS expenses (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      snapshot_id INTEGER NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
      name        TEXT    NOT NULL,
      amount      INTEGER NOT NULL DEFAULT 0 CHECK(amount >= 0),
      category_id INTEGER NOT NULL REFERENCES expense_categories(id) ON DELETE CASCADE,
      recurring   INTEGER NOT NULL DEFAULT 0 CHECK(recurring IN (0, 1))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS incomes (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      snapshot_id INTEGER NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
      name        TEXT    NOT NULL,
      amount      INTEGER NOT NULL DEFAULT 0 CHECK(amount >= 0),
      category    TEXT    NOT NULL,
      recurring   INTEGER NOT NULL DEFAULT 0 CHECK(recurring IN (0, 1))
    )
  `);
}
