import { router, publicProcedure } from '../trpc';
import { findPrevSnapshot } from '../lib/find-prev-snapshot';

interface SnapshotRow {
  id: number;
  year: number;
  month: number;
  created_at: string;
  updated_at: string;
}

function computeNetWorth(db: import('../trpc').Context['db'], snapshotId: number): number {
  const row = db
    .query<{ netWorth: number }, [number]>(
      `SELECT COALESCE(SUM(CASE WHEN type = 'asset' THEN balance ELSE -balance END), 0) AS netWorth
       FROM accounts WHERE snapshot_id = ?`
    )
    .get(snapshotId);
  return row?.netWorth ?? 0;
}

export const dashboardRouter = router({
  summary: publicProcedure.query(({ ctx }) => {
    const snapshots = ctx.db
      .query<SnapshotRow, []>(
        'SELECT id, year, month, created_at, updated_at FROM snapshots ORDER BY year DESC, month DESC'
      )
      .all();

    return snapshots.map((snap) => {
      const netWorth = computeNetWorth(ctx.db, snap.id);
      const prev = findPrevSnapshot(ctx.db, snap.year, snap.month);
      const previousNetWorth = prev !== null ? computeNetWorth(ctx.db, prev.id) : null;
      const delta = previousNetWorth !== null ? netWorth - previousNetWorth : null;
      return { ...snap, netWorth, previousNetWorth, delta };
    });
  }),
});
