import { z } from 'zod';
import { router, publicProcedure, TRPCError } from '../trpc';
import { trimmedText, eurCents } from '../lib/validators';
import { touchSnapshot } from '../lib/touch-snapshot';
import type { Context } from '../trpc';

interface IncomeRow {
  id: number;
  snapshot_id: number;
  name: string;
  amount: number;
  category: string;
  recurring: number;
}

function requireIncome(db: Context['db'], id: number, snapshotId: number): IncomeRow {
  const row = db
    .query<IncomeRow, [number, number]>(
      'SELECT id, snapshot_id, name, amount, category, recurring FROM incomes WHERE id = ? AND snapshot_id = ?'
    )
    .get(id, snapshotId);
  if (!row) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Income not found' });
  }
  return row;
}

const upsertInput = z.object({
  id: z.number().int().positive().optional(),
  snapshotId: z.number().int().positive(),
  name: trimmedText,
  amount: eurCents,
  category: trimmedText,
  recurring: z.boolean(),
});

export const incomesRouter = router({
  upsert: publicProcedure
    .input(upsertInput)
    .mutation(({ ctx, input }) => {
      const { id, snapshotId, name, amount, category, recurring } = input;
      const recurringInt = recurring ? 1 : 0;

      if (id !== undefined) {
        requireIncome(ctx.db, id, snapshotId);

        ctx.db.run(
          'UPDATE incomes SET name = ?, amount = ?, category = ?, recurring = ? WHERE id = ?',
          [name, amount, category, recurringInt, id]
        );

        touchSnapshot(ctx.db, snapshotId);

        return ctx.db
          .query<IncomeRow, [number]>(
            'SELECT id, snapshot_id, name, amount, category, recurring FROM incomes WHERE id = ?'
          )
          .get(id)!;
      } else {
        const snapExists = ctx.db
          .query<{ id: number }, [number]>('SELECT id FROM snapshots WHERE id = ?')
          .get(snapshotId);
        if (!snapExists) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Snapshot not found' });
        }

        const result = ctx.db
          .prepare(
            'INSERT INTO incomes (snapshot_id, name, amount, category, recurring) VALUES (?, ?, ?, ?, ?)'
          )
          .run(snapshotId, name, amount, category, recurringInt);

        const newId = Number(result.lastInsertRowid);
        touchSnapshot(ctx.db, snapshotId);

        return ctx.db
          .query<IncomeRow, [number]>(
            'SELECT id, snapshot_id, name, amount, category, recurring FROM incomes WHERE id = ?'
          )
          .get(newId)!;
      }
    }),

  delete: publicProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        snapshotId: z.number().int().positive(),
      })
    )
    .mutation(({ ctx, input }) => {
      const income = requireIncome(ctx.db, input.id, input.snapshotId);
      ctx.db.run('DELETE FROM incomes WHERE id = ?', [input.id]);
      touchSnapshot(ctx.db, input.snapshotId);
      return income;
    }),
});
