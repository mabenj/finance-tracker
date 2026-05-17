import { router } from '../trpc';
import { snapshotsRouter } from './snapshots';
import { accountsRouter } from './accounts';

export const appRouter = router({
  snapshots: snapshotsRouter,
  accounts: accountsRouter,
});

export type AppRouter = typeof appRouter;
