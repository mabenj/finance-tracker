import { Database } from 'bun:sqlite';
import { initDb } from './schema';

const DB_PATH = process.env.DB_PATH ?? 'finance.db';

// Guard against directory traversal in operator-supplied paths
if (DB_PATH.includes('..')) {
  throw new Error(`DB_PATH must not contain directory traversal sequences: "${DB_PATH}"`);
}

export const db = new Database(DB_PATH);
initDb(db);
