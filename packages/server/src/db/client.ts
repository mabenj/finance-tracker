import { Database } from 'bun:sqlite';
import { resolve } from 'node:path';
import { runMigrations } from './schema';

const DB_PATH = resolve(process.env.DB_PATH ?? 'finance.db');

export const db = new Database(DB_PATH);
db.run('PRAGMA foreign_keys = ON');
runMigrations(db);
