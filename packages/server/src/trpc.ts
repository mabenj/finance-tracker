import { initTRPC, TRPCError } from '@trpc/server';
import type { Database } from 'bun:sqlite';

export interface Context {
  db: Database;
}

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
export { TRPCError };
