import { TRPCError } from '../trpc';
import { touchSnapshot } from './touch-snapshot';
import type { Context } from '../trpc';

// Tables that carry a `position` column. The table name and scope clause are
// always internal constants (never user input), so interpolating them into the
// SQL string is safe from injection.
type ReorderTable = 'accounts' | 'incomes' | 'expenses' | 'expense_categories';

/**
 * Rewrite the `position` of every row in a sibling group to match `orderedIds`.
 *
 * Strict full-set semantics: `orderedIds` must list exactly the rows in scope —
 * same count, same members, no duplicates — otherwise BAD_REQUEST. This keeps
 * positions contiguous and collision-free even if a stale client posts.
 *
 * A group of 0 or 1 rows is a no-op (but the snapshot is still validated, so a
 * bad snapshotId always surfaces as NOT_FOUND).
 */
export function reorderWithinScope(
  db: Context['db'],
  table: ReorderTable,
  snapshotId: number,
  scopeClause: string,
  scopeParams: Array<number | null>,
  orderedIds: number[]
): { success: true } {
  const snapExists = db
    .query<{ id: number }, [number]>('SELECT id FROM snapshots WHERE id = ?')
    .get(snapshotId);
  if (!snapExists) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Snapshot not found' });
  }

  const existing = db
    .query<{ id: number }, Array<number | null>>(`SELECT id FROM ${table} WHERE ${scopeClause}`)
    .all(...scopeParams)
    .map((r) => r.id);

  if (orderedIds.length !== existing.length) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'orderedIds must list every row in this group exactly once',
    });
  }

  const existingSet = new Set(existing);
  const seen = new Set<number>();
  for (const id of orderedIds) {
    if (seen.has(id)) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'orderedIds contains a duplicate id' });
    }
    if (!existingSet.has(id)) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `id ${id} does not belong to this group`,
      });
    }
    seen.add(id);
  }

  if (orderedIds.length <= 1) {
    return { success: true }; // nothing to reorder
  }

  const update = db.prepare(`UPDATE ${table} SET position = ? WHERE id = ?`);
  db.transaction(() => {
    orderedIds.forEach((id, index) => update.run(index, id));
    touchSnapshot(db, snapshotId);
  })();

  return { success: true };
}
