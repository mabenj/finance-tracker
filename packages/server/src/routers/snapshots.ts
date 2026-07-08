import { z } from 'zod';
import { router, publicProcedure, TRPCError } from '../trpc';
import { carryForward } from '../services/carry-forward';
import { findPrevSnapshot } from '../lib/find-prev-snapshot';
import type { Recurrence } from '../lib/validators';

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
  position: number;
}

interface IncomeRow {
  id: number;
  name: string;
  amount: number;
  category: string;
  recurrence: Recurrence;
  position: number;
  carried_amount: number | null;
}

interface CategoryRow {
  id: number;
  name: string;
  parent_id: number | null;
  position: number;
}

interface ExpenseRow {
  id: number;
  name: string;
  amount: number;
  category_id: number;
  recurrence: Recurrence;
  position: number;
  carried_amount: number | null;
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
          'SELECT id, name, type, category, balance, total_paid, position FROM accounts WHERE snapshot_id = ? ORDER BY position, id'
        )
        .all(input.id);

      const previousAccounts = prevSnap
        ? ctx.db
            .query<AccountRow, [number]>(
              'SELECT id, name, type, category, balance, total_paid, position FROM accounts WHERE snapshot_id = ? ORDER BY position, id'
            )
            .all(prevSnap.id)
        : [];

      const incomes = ctx.db
        .query<IncomeRow, [number]>(
          'SELECT id, name, amount, category, recurrence, position, carried_amount FROM incomes WHERE snapshot_id = ? ORDER BY position, id'
        )
        .all(input.id);

      const categories = ctx.db
        .query<CategoryRow, [number]>(
          'SELECT id, name, parent_id, position FROM expense_categories WHERE snapshot_id = ? ORDER BY position, id'
        )
        .all(input.id);

      const expenses = ctx.db
        .query<ExpenseRow, [number]>(
          'SELECT id, name, amount, category_id, recurrence, position, carried_amount FROM expenses WHERE snapshot_id = ? ORDER BY position, id'
        )
        .all(input.id);

      return {
        ...snapshot,
        accounts,
        incomes,
        categories,
        expenses,
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
