import { z } from 'zod';
import { router, publicProcedure, TRPCError } from '../trpc';
import { trimmedText, eurCents } from '../lib/validators';
import { touchSnapshot } from '../lib/touch-snapshot';
import { reorderWithinScope } from '../lib/reorder';
import type { Context } from '../trpc';

interface ExpenseRow {
  id: number;
  snapshot_id: number;
  name: string;
  amount: number;
  category_id: number;
  recurring: number;
}

function requireExpense(db: Context['db'], id: number, snapshotId: number): ExpenseRow {
  const row = db
    .query<ExpenseRow, [number, number]>(
      'SELECT id, snapshot_id, name, amount, category_id, recurring FROM expenses WHERE id = ? AND snapshot_id = ?'
    )
    .get(id, snapshotId);
  if (!row) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Expense not found' });
  }
  return row;
}

function requireCategoryInSnapshot(db: Context['db'], categoryId: number, snapshotId: number): void {
  const row = db
    .query<{ id: number }, [number, number]>(
      'SELECT id FROM expense_categories WHERE id = ? AND snapshot_id = ?'
    )
    .get(categoryId, snapshotId);
  if (!row) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Category does not belong to this snapshot',
    });
  }
}

const upsertInput = z.object({
  id: z.number().int().positive().optional(),
  snapshotId: z.number().int().positive(),
  name: trimmedText,
  amount: eurCents,
  categoryId: z.number().int().positive(),
  recurring: z.boolean(),
});

export const expensesRouter = router({
  upsert: publicProcedure
    .input(upsertInput)
    .mutation(({ ctx, input }) => {
      const { id, snapshotId, name, amount, categoryId, recurring } = input;
      const recurringInt = recurring ? 1 : 0;

      if (id !== undefined) {
        const existing = requireExpense(ctx.db, id, snapshotId);
        requireCategoryInSnapshot(ctx.db, categoryId, snapshotId);

        if (existing.category_id === categoryId) {
          // Same category — position is unchanged.
          ctx.db.run(
            'UPDATE expenses SET name = ?, amount = ?, category_id = ?, recurring = ? WHERE id = ? AND snapshot_id = ?',
            [name, amount, categoryId, recurringInt, id, snapshotId]
          );
        } else {
          // Re-parented to a different category — append to the end of the
          // new category so it lands in a well-defined spot (its old position
          // would be meaningless among the new siblings).
          ctx.db.run(
            `UPDATE expenses
             SET name = ?, amount = ?, category_id = ?, recurring = ?,
                 position = (SELECT COALESCE(MAX(position) + 1, 0) FROM expenses WHERE category_id = ?)
             WHERE id = ? AND snapshot_id = ?`,
            [name, amount, categoryId, recurringInt, categoryId, id, snapshotId]
          );
        }

        touchSnapshot(ctx.db, snapshotId);

        return ctx.db
          .query<ExpenseRow, [number]>(
            'SELECT id, snapshot_id, name, amount, category_id, recurring FROM expenses WHERE id = ?'
          )
          .get(id)!;
      } else {
        const snapExists = ctx.db
          .query<{ id: number }, [number]>('SELECT id FROM snapshots WHERE id = ?')
          .get(snapshotId);
        if (!snapExists) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Snapshot not found' });
        }

        requireCategoryInSnapshot(ctx.db, categoryId, snapshotId);

        const result = ctx.db
          .prepare(
            `INSERT INTO expenses (snapshot_id, name, amount, category_id, recurring, position)
             VALUES (?, ?, ?, ?, ?, (SELECT COALESCE(MAX(position) + 1, 0) FROM expenses WHERE category_id = ?))`
          )
          .run(snapshotId, name, amount, categoryId, recurringInt, categoryId);

        const newId = Number(result.lastInsertRowid);
        touchSnapshot(ctx.db, snapshotId);

        return ctx.db
          .query<ExpenseRow, [number]>(
            'SELECT id, snapshot_id, name, amount, category_id, recurring FROM expenses WHERE id = ?'
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
      const expense = requireExpense(ctx.db, input.id, input.snapshotId);
      ctx.db.run('DELETE FROM expenses WHERE id = ? AND snapshot_id = ?', [input.id, input.snapshotId]);
      touchSnapshot(ctx.db, input.snapshotId);
      return expense;
    }),

  reorder: publicProcedure
    .input(
      z.object({
        snapshotId: z.number().int().positive(),
        categoryId: z.number().int().positive(),
        orderedIds: z.array(z.number().int().positive()),
      })
    )
    .mutation(({ ctx, input }) =>
      reorderWithinScope(
        ctx.db,
        'expenses',
        input.snapshotId,
        'snapshot_id = ? AND category_id = ?',
        [input.snapshotId, input.categoryId],
        input.orderedIds
      )
    ),
});
