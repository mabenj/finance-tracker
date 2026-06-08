import { z } from 'zod';
import { router, publicProcedure, TRPCError } from '../trpc';
import { trimmedText, eurCents } from '../lib/validators';
import { touchSnapshot } from '../lib/touch-snapshot';
import { reorderWithinScope } from '../lib/reorder';
import type { Context } from '../trpc';

interface AccountRow {
  id: number;
  snapshot_id: number;
  name: string;
  type: string;
  category: string;
  balance: number;
  total_paid: number | null;
  position: number;
}

const upsertInput = z.object({
  id: z.number().int().positive().optional(),
  snapshotId: z.number().int().positive(),
  name: trimmedText,
  type: z.enum(['asset', 'liability']),
  category: trimmedText,
  balance: eurCents,
  totalPaid: eurCents.nullable().optional(),
});

// Fetches the account and verifies it belongs to the given snapshot.
// Throws NOT_FOUND if missing or owned by a different snapshot (A1/A2 fix).
function requireAccount(db: Context['db'], id: number, snapshotId: number): AccountRow {
  const row = db
    .query<AccountRow, [number, number]>(
      'SELECT id, snapshot_id, name, type, category, balance, total_paid, position FROM accounts WHERE id = ? AND snapshot_id = ?'
    )
    .get(id, snapshotId);
  if (!row) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Account not found' });
  }
  return row;
}

export const accountsRouter = router({
  upsert: publicProcedure
    .input(upsertInput)
    .mutation(({ ctx, input }) => {
      const { id, snapshotId, name, type, category, balance, totalPaid = null } = input;

      if (id !== undefined) {
        requireAccount(ctx.db, id, snapshotId); // verifies existence AND snapshot ownership

        ctx.db.run(
          'UPDATE accounts SET name = ?, type = ?, category = ?, balance = ?, total_paid = ? WHERE id = ?',
          [name, type, category, balance, totalPaid, id]
        );

        touchSnapshot(ctx.db, snapshotId);

        return ctx.db
          .query<AccountRow, [number]>(
            'SELECT id, snapshot_id, name, type, category, balance, total_paid, position FROM accounts WHERE id = ?'
          )
          .get(id)!;
      } else {
        // Explicit snapshot existence check gives a clean NOT_FOUND instead of an
        // opaque FK constraint error (A3 fix — FK enforcement is on, but the DB error
        // message is not user-friendly).
        const snapExists = ctx.db
          .query<{ id: number }, [number]>('SELECT id FROM snapshots WHERE id = ?')
          .get(snapshotId);
        if (!snapExists) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Snapshot not found' });
        }

        const result = ctx.db
          .prepare(
            `INSERT INTO accounts (snapshot_id, name, type, category, balance, total_paid, position)
             VALUES (?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(position) + 1, 0) FROM accounts WHERE snapshot_id = ?))`
          )
          .run(snapshotId, name, type, category, balance, totalPaid, snapshotId);

        const newId = Number(result.lastInsertRowid);
        touchSnapshot(ctx.db, snapshotId);

        return ctx.db
          .query<AccountRow, [number]>(
            'SELECT id, snapshot_id, name, type, category, balance, total_paid, position FROM accounts WHERE id = ?'
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
      // requireAccount also enforces snapshot ownership (A2 fix)
      const account = requireAccount(ctx.db, input.id, input.snapshotId);

      ctx.db.run('DELETE FROM accounts WHERE id = ?', [input.id]);
      touchSnapshot(ctx.db, input.snapshotId);

      return account; // return deleted entity per spec §10
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
        'accounts',
        input.snapshotId,
        'snapshot_id = ?',
        [input.snapshotId],
        input.orderedIds
      )
    ),
});
