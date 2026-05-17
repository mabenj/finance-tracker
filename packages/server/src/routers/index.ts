import { router } from '../trpc';
import { snapshotsRouter } from './snapshots';

export const appRouter = router({
  snapshots: snapshotsRouter,
});

export type AppRouter = typeof appRouter;
