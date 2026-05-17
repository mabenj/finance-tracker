import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '@finance-tracker/server/routers';

export const trpc = createTRPCReact<AppRouter>();
