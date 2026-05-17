import type { Context } from '../trpc';

interface SnapshotRow {
  id: number;
  year: number;
  month: number;
  created_at: string;
  updated_at: string;
}

export function findPrevSnapshot(
  db: Context['db'],
  year: number,
  month: number
): SnapshotRow | null {
  return (
    db
      .query<SnapshotRow, [number, number, number]>(
        `SELECT id, year, month, created_at, updated_at FROM snapshots
         WHERE (year < ? OR (year = ? AND month < ?))
         ORDER BY year DESC, month DESC LIMIT 1`
      )
      .get(year, year, month) ?? null
  );
}
