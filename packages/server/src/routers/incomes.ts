import { z } from 'zod';
import { router, publicProcedure, TRPCError } from '../trpc';
import { trimmedText, eurCents, recurrence, type Recurrence } from '../lib/validators';
import { touchSnapshot } from '../lib/touch-snapshot';
import { reorderWithinScope } from '../lib/reorder';
import type { Context } from '../trpc';

interface IncomeRow {
  id: number;
  snapshot_id: number;
  name: string;
  amount: number;
  category: string;
  recurrence: Recurrence;
  position: number;
}

function requireIncome(db: Context['db'], id: number, snapshotId: number): IncomeRow {
  const row = db
    .query<IncomeRow, [number, number]>(
      'SELECT id, snapshot_id, name, amount, category, recurrence, position FROM incomes WHERE id = ? AND snapshot_id = ?'
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
  recurrence,
});

export const incomesRouter = router({
  upsert: publicProcedure
    .input(upsertInput)
    .mutation(({ ctx, input }) => {
      const { id, snapshotId, name, amount, category, recurrence } = input;

      if (id !== undefined) {
        requireIncome(ctx.db, id, snapshotId);

        ctx.db.run(
          'UPDATE incomes SET name = ?, amount = ?, category = ?, recurrence = ? WHERE id = ?',
          [name, amount, category, recurrence, id]
        );

        touchSnapshot(ctx.db, snapshotId);

        return ctx.db
          .query<IncomeRow, [number]>(
            'SELECT id, snapshot_id, name, amount, category, recurrence, position FROM incomes WHERE id = ?'
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
            `INSERT INTO incomes (snapshot_id, name, amount, category, recurrence, position)
             VALUES (?, ?, ?, ?, ?, (SELECT COALESCE(MAX(position) + 1, 0) FROM incomes WHERE snapshot_id = ?))`
          )
          .run(snapshotId, name, amount, category, recurrence, snapshotId);

        const newId = Number(result.lastInsertRowid);
        touchSnapshot(ctx.db, snapshotId);

        return ctx.db
          .query<IncomeRow, [number]>(
            'SELECT id, snapshot_id, name, amount, category, recurrence, position FROM incomes WHERE id = ?'
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

  reorder: publicProcedure
    .input(
      z.object({
        snapshotId: z.number().int().positive(),
        orderedIds: z.array(z.number().int().positive()),
      })
    )
    .mutation(({ ctx, input }) =>
      reorderWithinScope(
        ctx.db,
        'incomes',
        input.snapshotId,
        'snapshot_id = ?',
        [input.snapshotId],
        input.orderedIds
      )
    ),
});
