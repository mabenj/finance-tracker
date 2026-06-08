import { z } from 'zod';
import { router, publicProcedure, TRPCError } from '../trpc';
import { trimmedText } from '../lib/validators';
import { touchSnapshot } from '../lib/touch-snapshot';
import { reorderWithinScope } from '../lib/reorder';
import type { Context } from '../trpc';

interface CategoryRow {
  id: number;
  snapshot_id: number;
  name: string;
  parent_id: number | null;
  position: number;
}

function requireCategory(db: Context['db'], id: number, snapshotId: number): CategoryRow {
  const row = db
    .query<CategoryRow, [number, number]>(
      'SELECT id, snapshot_id, name, parent_id, position FROM expense_categories WHERE id = ? AND snapshot_id = ?'
    )
    .get(id, snapshotId);
  if (!row) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Category not found' });
  }
  return row;
}

export const categoriesRouter = router({
  create: publicProcedure
    .input(
      z.object({
        snapshotId: z.number().int().positive(),
        name: trimmedText,
        parentId: z.number().int().positive().optional(),
      })
    )
    .mutation(({ ctx, input }) => {
      const { snapshotId, name, parentId } = input;

      const snapExists = ctx.db
        .query<{ id: number }, [number]>('SELECT id FROM snapshots WHERE id = ?')
        .get(snapshotId);
      if (!snapExists) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Snapshot not found' });
      }

      if (parentId !== undefined) {
        requireCategory(ctx.db, parentId, snapshotId);
      }

      try {
        const result = ctx.db
          .prepare(
            `INSERT INTO expense_categories (snapshot_id, name, parent_id, position)
             VALUES (?, ?, ?, (SELECT COALESCE(MAX(position) + 1, 0) FROM expense_categories WHERE snapshot_id = ? AND parent_id IS ?))`
          )
          .run(snapshotId, name, parentId ?? null, snapshotId, parentId ?? null);
        const id = Number(result.lastInsertRowid);
        const position = ctx.db
          .query<{ position: number }, [number]>('SELECT position FROM expense_categories WHERE id = ?')
          .get(id)!.position;
        touchSnapshot(ctx.db, snapshotId);
        return { id, snapshot_id: snapshotId, name, parent_id: parentId ?? null, position };
      } catch (err) {
        if (err instanceof Error && err.message.includes('UNIQUE constraint failed')) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: `A category named "${name}" already exists at this level`,
          });
        }
        throw err;
      }
    }),

  update: publicProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        snapshotId: z.number().int().positive(),
        name: trimmedText,
      })
    )
    .mutation(({ ctx, input }) => {
      const { id, snapshotId, name } = input;
      const cat = requireCategory(ctx.db, id, snapshotId);

      try {
        ctx.db.run('UPDATE expense_categories SET name = ? WHERE id = ?', [name, id]);
        touchSnapshot(ctx.db, snapshotId);
        return { ...cat, name };
      } catch (err) {
        if (err instanceof Error && err.message.includes('UNIQUE constraint failed')) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: `A category named "${name}" already exists at this level`,
          });
        }
        throw err;
      }
    }),

  deletePreview: publicProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        snapshotId: z.number().int().positive(),
      })
    )
    .query(({ ctx, input }) => {
      requireCategory(ctx.db, input.id, input.snapshotId);

      return ctx.db
        .query<
          { subcategoryCount: number; expenseCount: number; totalAmount: number },
          [number, number, number]
        >(
          `WITH RECURSIVE sub(id) AS (
            SELECT id FROM expense_categories WHERE id = ? AND snapshot_id = ?
            UNION ALL
            SELECT c.id FROM expense_categories c
            JOIN sub ON c.parent_id = sub.id
            WHERE c.snapshot_id = ?
          )
          SELECT
            (SELECT count(*) - 1 FROM sub)                                                      AS subcategoryCount,
            (SELECT count(*) FROM expenses WHERE category_id IN (SELECT id FROM sub))           AS expenseCount,
            (SELECT COALESCE(sum(amount), 0) FROM expenses WHERE category_id IN (SELECT id FROM sub)) AS totalAmount`
        )
        .get(input.id, input.snapshotId, input.snapshotId)!;
    }),

  delete: publicProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        snapshotId: z.number().int().positive(),
      })
    )
    .mutation(({ ctx, input }) => {
      const cat = requireCategory(ctx.db, input.id, input.snapshotId);
      // ON DELETE CASCADE on parent_id handles all descendants; cascade on category_id deletes expenses
      ctx.db.run('DELETE FROM expense_categories WHERE id = ?', [input.id]);
      touchSnapshot(ctx.db, input.snapshotId);
      return cat;
    }),

  reorder: publicProcedure
    .input(
      z.object({
        snapshotId: z.number().int().positive(),
        parentId: z.number().int().positive().nullable(),
        orderedIds: z.array(z.number().int().positive()),
      })
    )
    .mutation(({ ctx, input }) =>
      reorderWithinScope(
        ctx.db,
        'expense_categories',
        input.snapshotId,
        'snapshot_id = ? AND parent_id IS ?',
        [input.snapshotId, input.parentId],
        input.orderedIds
      )
    ),
});
