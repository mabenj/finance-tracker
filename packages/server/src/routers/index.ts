import { router } from '../trpc';
import { snapshotsRouter } from './snapshots';
import { accountsRouter } from './accounts';
import { incomesRouter } from './incomes';
import { categoriesRouter } from './categories';
import { expensesRouter } from './expenses';
import { dashboardRouter } from './dashboard';

export const appRouter = router({
  snapshots: snapshotsRouter,
  accounts: accountsRouter,
  incomes: incomesRouter,
  categories: categoriesRouter,
  expenses: expensesRouter,
  dashboard: dashboardRouter,
});

export type AppRouter = typeof appRouter;
