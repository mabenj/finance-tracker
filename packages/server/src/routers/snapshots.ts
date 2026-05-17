import { z } from 'zod';
import { router, publicProcedure, TRPCError } from '../trpc';
import { carryForward } from '../services/carry-forward';

interface SnapshotRow {
  id: number;
  year: number;
  month: number;
  created_at: string;
  updated_at: string;
}

interface AccountRow {
  id: number;
  name: string;
  type: string;
  category: string;
  balance: number;
  total_paid: number | null;
}

interface IncomeRow {
  id: number;
  name: string;
  amount: number;
  category: string;
  recurring: number;
}

interface CategoryRow {
  id: number;
  name: string;
  parent_id: number | null;
}

function findPrevSnapshot(db: import('../trpc').Context['db'], year: number, month: number): SnapshotRow | null {
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

export const snapshotsRouter = router({
  list: publicProcedure.query(({ ctx }) => {
    return ctx.db
      .query<SnapshotRow, []>(
        'SELECT id, year, month, created_at, updated_at FROM snapshots ORDER BY year DESC, month DESC'
      )
      .all();
  }),

  get: publicProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(({ ctx, input }) => {
      const snapshot = ctx.db
        .query<SnapshotRow, [number]>(
          'SELECT id, year, month, created_at, updated_at FROM snapshots WHERE id = ?'
        )
        .get(input.id);

      if (!snapshot) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Snapshot not found' });
      }

      const prevSnap = findPrevSnapshot(ctx.db, snapshot.year, snapshot.month);

      const accounts = ctx.db
        .query<AccountRow, [number]>(
          'SELECT id, name, type, category, balance, total_paid FROM accounts WHERE snapshot_id = ? ORDER BY id'
        )
        .all(input.id);

      const previousAccounts = prevSnap
        ? ctx.db
            .query<AccountRow, [number]>(
              'SELECT id, name, type, category, balance, total_paid FROM accounts WHERE snapshot_id = ? ORDER BY id'
            )
            .all(prevSnap.id)
        : [];

      const incomes = ctx.db
        .query<IncomeRow, [number]>(
          'SELECT id, name, amount, category, recurring FROM incomes WHERE snapshot_id = ? ORDER BY id'
        )
        .all(input.id);

      const categories = ctx.db
        .query<CategoryRow, [number]>(
          'SELECT id, name, parent_id FROM expense_categories WHERE snapshot_id = ? ORDER BY id'
        )
        .all(input.id);

      return {
        ...snapshot,
        accounts,
        incomes,
        categories,
        previousSnapshot: prevSnap
          ? { ...prevSnap, accounts: previousAccounts }
          : null,
      };
    }),

  create: publicProcedure
    .input(
      z.object({
        year: z.number().int().min(1),
        month: z.number().int().min(1).max(12),
      })
    )
    .mutation(({ ctx, input }) => {
      const { year, month } = input;

      const existing = ctx.db
        .query<{ id: number }, [number, number]>(
          'SELECT id FROM snapshots WHERE year = ? AND month = ?'
        )
        .get(year, month);

      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `A snapshot for ${year}-${String(month).padStart(2, '0')} already exists`,
        });
      }

      const prevSnapshot = findPrevSnapshot(ctx.db, year, month);

      const result = ctx.db
        .prepare('INSERT INTO snapshots (year, month) VALUES (?, ?)')
        .run(year, month);

      const newSnapshotId = Number(result.lastInsertRowid);

      carryForward(ctx.db, newSnapshotId, prevSnapshot?.id ?? null);

      return ctx.db
        .query<SnapshotRow, [number]>(
          'SELECT id, year, month, created_at, updated_at FROM snapshots WHERE id = ?'
        )
        .get(newSnapshotId)!;
    }),

  delete: publicProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(({ ctx, input }) => {
      const existing = ctx.db
        .query<{ id: number }, [number]>('SELECT id FROM snapshots WHERE id = ?')
        .get(input.id);

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Snapshot not found' });
      }

      ctx.db.run('DELETE FROM snapshots WHERE id = ?', [input.id]);
      return { success: true };
    }),
});
