import type { Database } from 'bun:sqlite';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

function getMigrationId(filename: string): number {
  const match = filename.match(/^migration_(\d+)\.sql$/);
  if (!match) throw new Error(`Unexpected migration filename: ${filename}`);
  return parseInt(match[1]);
}

export function runMigrations(db: Database): void {
  db.run('PRAGMA foreign_keys = ON');

  db.run(`
    CREATE TABLE IF NOT EXISTS migrations (
      id         INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    )
  `);

  const migrationsDir = join(import.meta.dir, 'migrations');
  if (!existsSync(migrationsDir)) {
    throw new Error(`Migrations directory not found: ${migrationsDir}`);
  }

  const files = readdirSync(migrationsDir)
    .filter((f) => /^migration_\d+\.sql$/.test(f))
    .sort((a, b) => getMigrationId(a) - getMigrationId(b));

  const hasBeenApplied = db.query<{ id: number }, [number]>('SELECT id FROM migrations WHERE id = ?');

  for (const file of files) {
    const id = getMigrationId(file);
    if (hasBeenApplied.get(id)) continue;

    const sql = readFileSync(join(migrationsDir, file), 'utf-8');
    db.transaction(() => {
      db.exec(sql);
      db.run('INSERT INTO migrations (id) VALUES (?)', [id]);
    })();
  }
}
