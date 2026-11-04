/**
 * One-time bulk importer for historical monthly snapshot JSON files.
 *
 *   npx bun packages/server/scripts/import-snapshots.ts <dir> [--replace] [--dry-run]
 *
 * Reads every `YYYY-MM-DD.json` in <dir> (day is dropped → snapshot is keyed by
 * year+month), maps it onto the live schema, and inserts it directly. Each file
 * runs in its own transaction: any error rolls that file back and the run
 * continues.
 *
 * Flags:
 *   --replace   overwrite an existing (year, month) snapshot (DELETE cascade + reinsert)
 *   --dry-run   parse + map + report, but roll everything back (writes nothing)
 *
 * Money: every euro value is rounded to integer cents (×100). The DB stores cents.
 */

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Default the DB to packages/server/finance.db (unless DB_PATH is set) BEFORE
// importing the client, which resolves DB_PATH relative to cwd at import time.
// The client is imported dynamically below so this env var is set first.
process.env.DB_PATH ??= resolve(import.meta.dir, '..', 'finance.db');
const { db } = await import('../src/db/client.ts');
import type { Database } from 'bun:sqlite';

// ---------------------------------------------------------------------------
// Types matching the input JSON shape.
// ---------------------------------------------------------------------------

interface NetWorthComponent {
  name: string;
  liability: number;
  asset: number;
  type: 'loan' | 'asset' | 'liquid' | string;
}

interface Salary {
  gross: number;
  net: number;
}

type ExpenseNode = number | { [key: string]: ExpenseNode };

interface SnapshotJson {
  netWorthComponents?: NetWorthComponent[];
  salary?: Salary;
  expenses?: { [key: string]: ExpenseNode };
}

const TAXES_CATEGORY = 'Verot ja maksut';

// ---------------------------------------------------------------------------
// Error + reporting helpers.
// ---------------------------------------------------------------------------

/** A clean, expected per-file failure (bad data). Carries a readable message. */
class ImportError extends Error {}

/** Thrown at the end of a file's transaction in --dry-run to force a rollback. */
class DryRunRollback extends Error {}

type FileStatus = 'imported' | 'replaced' | 'skipped' | 'errored';

interface FileResult {
  file: string;
  status: FileStatus;
  detail: string;
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Money conversion.
// ---------------------------------------------------------------------------

function toCents(euros: unknown, ctx: string, warn: (msg: string) => void): number {
  if (typeof euros !== 'number' || !Number.isFinite(euros)) {
    throw new ImportError(`${ctx}: expected a finite number, got ${JSON.stringify(euros)}`);
  }
  if (euros < 0) {
    throw new ImportError(`${ctx}: negative amount ${euros} is not allowed`);
  }
  if (!Number.isInteger(euros)) {
    warn(`${ctx}: non-integer euro value ${euros} rounded to ${Math.round(euros * 100)} cents`);
  }
  return Math.round(euros * 100);
}

/**
 * Mirror the tRPC `trimmedText` validator (trim → non-empty → max 100 chars) so
 * imported names round-trip cleanly through the app's edit UI (which rejects
 * names >100 chars on save). The DB itself has no length/empty CHECK.
 */
function cleanName(name: unknown, ctx: string): string {
  if (typeof name !== 'string') {
    throw new ImportError(`${ctx}: name must be a string, got ${JSON.stringify(name)}`);
  }
  const trimmed = name.trim();
  if (trimmed.length < 1) throw new ImportError(`${ctx}: name is empty`);
  if (trimmed.length > 100) throw new ImportError(`${ctx}: name exceeds 100 characters`);
  return trimmed;
}

// ---------------------------------------------------------------------------
// Filename parsing.
// ---------------------------------------------------------------------------

const FILENAME_RE = /^(\d{4})-(\d{2})-(\d{2})\.json$/;

function parseFilename(file: string): { year: number; month: number; date: string } {
  const m = file.match(FILENAME_RE);
  if (!m) {
    throw new ImportError(`filename does not match YYYY-MM-DD.json`);
  }
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  if (year < 1) throw new ImportError(`invalid year ${year}`);
  if (month < 1 || month > 12) throw new ImportError(`invalid month ${month} (must be 1-12)`);
  return { year, month, date: `${m[1]}-${m[2]}-${m[3]}` };
}

// ---------------------------------------------------------------------------
// Insert helpers (prepared statements bound to the shared db).
// ---------------------------------------------------------------------------

const stmt = {
  getSnapshot: db.query<{ id: number }, [number, number]>(
    'SELECT id FROM snapshots WHERE year = ? AND month = ?'
  ),
  deleteSnapshot: db.prepare('DELETE FROM snapshots WHERE id = ?'),
  insertSnapshot: db.prepare('INSERT INTO snapshots (year, month) VALUES (?, ?)'),
  insertAccount: db.prepare(
    'INSERT INTO accounts (snapshot_id, name, type, category, balance, total_paid, position) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ),
  insertIncome: db.prepare(
    'INSERT INTO incomes (snapshot_id, name, amount, category, recurrence, position) VALUES (?, ?, ?, ?, ?, ?)'
  ),
  insertCategory: db.prepare(
    'INSERT INTO expense_categories (snapshot_id, name, parent_id, position) VALUES (?, ?, ?, ?)'
  ),
  insertExpense: db.prepare(
    'INSERT INTO expenses (snapshot_id, name, amount, category_id, recurrence, position) VALUES (?, ?, ?, ?, ?, ?)'
  ),
};

interface Counts {
  accounts: number;
  incomes: number;
  categories: number;
  expenses: number;
}

function insertAccounts(
  snapshotId: number,
  components: NetWorthComponent[] | undefined,
  warn: (msg: string) => void
): number {
  if (!components) {
    warn('no netWorthComponents key — importing zero accounts');
    return 0;
  }
  components.forEach((c, index) => {
    const where = `account "${typeof c.name === 'string' ? c.name : '(unnamed)'}"`;
    const name = cleanName(c.name, where);
    let dbType: 'asset' | 'liability';
    let balance: number;
    let totalPaid: number | null;
    let category: string;

    if (c.type === 'loan') {
      dbType = 'liability';
      balance = toCents(c.liability, `${where} liability`, warn);
      totalPaid = toCents(c.asset, `${where} asset (principal paid)`, warn);
      category = 'laina';
    } else if (c.type === 'asset' || c.type === 'liquid') {
      if (typeof c.liability === 'number' && c.liability !== 0) {
        throw new ImportError(
          `${where}: type "${c.type}" has a non-zero liability (${c.liability}); only loans may carry a liability`
        );
      }
      dbType = 'asset';
      balance = toCents(c.asset, `${where} asset`, warn);
      totalPaid = null;
      category =
        c.type === 'liquid' ? 'käteinen' : c.name === 'Asunto' ? 'kiinteistö' : 'sijoitus';
    } else {
      throw new ImportError(`${where}: unknown type "${c.type}" (expected loan/asset/liquid)`);
    }

    stmt.insertAccount.run(snapshotId, name, dbType, category, balance, totalPaid, index);
  });
  return components.length;
}

/**
 * Inserts the income row (if salary is present) and returns whether it did,
 * plus the gross-net diff (cents) for the synthesized taxes expense (or null).
 */
function insertIncomeAndComputeTaxes(
  snapshotId: number,
  salary: Salary | undefined,
  warn: (msg: string) => void
): { incomeInserted: boolean; taxCents: number | null } {
  if (!salary || typeof salary.gross !== 'number' || typeof salary.net !== 'number') {
    warn('no salary (gross/net) — importing no income row and no taxes expense');
    return { incomeInserted: false, taxCents: null };
  }
  const grossCents = toCents(salary.gross, 'salary.gross', warn);
  // The importer treats every historical item as one-off (recurrence 'none');
  // the first real carry-forward after import is what establishes recurrence.
  stmt.insertIncome.run(snapshotId, 'Palkka', grossCents, 'Palkka', 'none', 0);

  if (salary.net > salary.gross) {
    warn(`salary.net (${salary.net}) exceeds salary.gross (${salary.gross}) — no taxes expense created`);
    return { incomeInserted: true, taxCents: null };
  }
  const taxCents = grossCents - toCents(salary.net, 'salary.net', warn);
  return { incomeInserted: true, taxCents: taxCents > 0 ? taxCents : null };
}

function insertExpenses(
  snapshotId: number,
  expenses: SnapshotJson['expenses'],
  taxCents: number | null,
  warn: (msg: string) => void
): { categories: number; expenses: number } {
  const counts = { categories: 0, expenses: 0 };

  // Guard the synthesized taxes category against a real top-level key of the
  // same name (would otherwise collide on the category unique index with an
  // opaque error and roll the whole file back).
  if (taxCents !== null && expenses && Object.keys(expenses).includes(TAXES_CATEGORY)) {
    throw new ImportError(
      `expenses already contains a top-level "${TAXES_CATEGORY}" category, which collides with the synthesized taxes category`
    );
  }

  let topCatPos = 0;

  if (taxCents !== null) {
    const res = stmt.insertCategory.run(snapshotId, TAXES_CATEGORY, null, topCatPos++);
    const taxCatId = Number(res.lastInsertRowid);
    stmt.insertExpense.run(snapshotId, TAXES_CATEGORY, taxCents, taxCatId, 'none', 0);
    counts.categories++;
    counts.expenses++;
  }

  if (!expenses) {
    warn('no expenses key — importing no spending categories');
    return counts;
  }

  // Recurse the tree. `parentId === null` means top level, where only category
  // objects are permitted (a bare number there is a hard error).
  const recurse = (obj: { [key: string]: ExpenseNode }, parentId: number | null, catStart: number) => {
    let catPos = catStart;
    let expPos = 0;
    for (const [key, val] of Object.entries(obj)) {
      if (typeof val === 'number') {
        if (parentId === null) {
          throw new ImportError(`numeric value "${key}" at top level of expenses (must be inside a category)`);
        }
        const expName = cleanName(key, `expense "${key}"`);
        stmt.insertExpense.run(snapshotId, expName, toCents(val, `expense "${key}"`, warn), parentId, 'none', expPos++);
        counts.expenses++;
      } else if (val && typeof val === 'object') {
        const catName = cleanName(key, `category "${key}"`);
        const res = stmt.insertCategory.run(snapshotId, catName, parentId, catPos++);
        counts.categories++;
        recurse(val, Number(res.lastInsertRowid), 0);
      } else {
        throw new ImportError(`unexpected value for "${key}": ${JSON.stringify(val)}`);
      }
    }
  };

  recurse(expenses, null, topCatPos);
  return counts;
}

// ---------------------------------------------------------------------------
// Per-file processing.
// ---------------------------------------------------------------------------

function processFile(dir: string, file: string, replace: boolean, dryRun: boolean): FileResult {
  const warnings: string[] = [];
  const warn = (msg: string) => warnings.push(msg);

  let year: number, month: number;
  try {
    ({ year, month } = parseFilename(file));
  } catch (e) {
    return { file, status: 'errored', detail: (e as Error).message, warnings };
  }

  let json: SnapshotJson;
  try {
    json = JSON.parse(readFileSync(join(dir, file), 'utf-8'));
  } catch (e) {
    return { file, status: 'errored', detail: `JSON parse failed: ${(e as Error).message}`, warnings };
  }

  let result: { status: FileStatus; detail: string } | undefined;

  const tx = (db as Database).transaction(() => {
    const existing = stmt.getSnapshot.get(year, month);

    if (existing && !replace) {
      result = { status: 'skipped', detail: `${year}-${String(month).padStart(2, '0')} already exists (use --replace to overwrite)` };
      if (dryRun) throw new DryRunRollback();
      return;
    }
    if (existing && replace) {
      stmt.deleteSnapshot.run(existing.id);
    }

    const res = stmt.insertSnapshot.run(year, month);
    const snapshotId = Number(res.lastInsertRowid);

    const accounts = insertAccounts(snapshotId, json.netWorthComponents, warn);
    const { incomeInserted, taxCents } = insertIncomeAndComputeTaxes(snapshotId, json.salary, warn);
    const incomes = incomeInserted ? 1 : 0;
    const exp = insertExpenses(snapshotId, json.expenses, taxCents, warn);

    const counts: Counts = { accounts, incomes, categories: exp.categories, expenses: exp.expenses };
    result = {
      status: existing ? 'replaced' : 'imported',
      detail: `${year}-${String(month).padStart(2, '0')}: ${counts.accounts} accounts, ${counts.incomes} income, ${counts.categories} categories, ${counts.expenses} expenses`,
    };

    if (dryRun) throw new DryRunRollback();
  });

  try {
    tx();
  } catch (e) {
    if (e instanceof DryRunRollback) {
      // result was assigned before the rollback signal; surface it as-is.
      return { file, status: result!.status, detail: `[dry-run] ${result!.detail}`, warnings };
    }
    const msg = e instanceof ImportError ? e.message : `unexpected error: ${(e as Error).message}`;
    return { file, status: 'errored', detail: msg, warnings };
  }

  return { file, status: result!.status, detail: result!.detail, warnings };
}

// ---------------------------------------------------------------------------
// Entry point.
// ---------------------------------------------------------------------------

function main() {
  const argv = process.argv.slice(2);
  const flags = new Set(argv.filter((a) => a.startsWith('--')));
  const positionals = argv.filter((a) => !a.startsWith('--'));
  const dir = positionals[0];
  const replace = flags.has('--replace');
  const dryRun = flags.has('--dry-run');

  for (const f of flags) {
    if (f !== '--replace' && f !== '--dry-run') {
      console.error(`Unknown flag: ${f}`);
      process.exit(2);
    }
  }
  if (!dir) {
    console.error('Usage: npx bun packages/server/scripts/import-snapshots.ts <dir> [--replace] [--dry-run]');
    process.exit(2);
  }
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    console.error(`Not a directory: ${dir}`);
    process.exit(2);
  }

  const files = readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.json'))
    .sort(); // YYYY-MM-DD.json sorts chronologically as a string

  if (files.length === 0) {
    console.error(`No .json files found in ${dir}`);
    process.exit(1);
  }

  console.log(
    `Importing ${files.length} file(s) from ${resolve(dir)} → ${process.env.DB_PATH}` +
      `${replace ? ' [--replace]' : ''}${dryRun ? ' [DRY RUN — nothing will be written]' : ''}\n`
  );

  const results: FileResult[] = [];
  for (const file of files) {
    const r = processFile(dir, file, replace, dryRun);
    results.push(r);

    const tag =
      r.status === 'imported' ? 'OK  ' :
      r.status === 'replaced' ? 'REPL' :
      r.status === 'skipped' ? 'SKIP' :
      'ERR ';
    console.log(`[${tag}] ${file} — ${r.detail}`);
    for (const w of r.warnings) console.log(`        ⚠ ${w}`);
  }

  const tally = (s: FileStatus) => results.filter((r) => r.status === s).length;
  console.log(
    `\nDone. imported=${tally('imported')} replaced=${tally('replaced')} ` +
      `skipped=${tally('skipped')} errored=${tally('errored')}` +
      `${dryRun ? '  (dry run — no changes written)' : ''}`
  );

  if (tally('errored') > 0) process.exit(1);
}

main();
