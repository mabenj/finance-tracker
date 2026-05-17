import { router } from '../trpc';
import { snapshotsRouter } from './snapshots';
import { accountsRouter } from './accounts';
import { incomesRouter } from './incomes';
import { categoriesRouter } from './categories';

export const appRouter = router({
  snapshots: snapshotsRouter,
  accounts: accountsRouter,
  incomes: incomesRouter,
  categories: categoriesRouter,
});

export type AppRouter = typeof appRouter;
