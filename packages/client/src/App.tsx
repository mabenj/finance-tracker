import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { trpc } from './lib/trpc';
import { Dashboard } from './pages/Dashboard';
import { Snapshot } from './pages/Snapshot';
import { NewSnapshot } from './pages/NewSnapshot';
import { ToastProvider } from './lib/toast';
import { ThemeProvider } from './lib/theme';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
  },
});

const trpcClient = trpc.createClient({
  links: [httpBatchLink({ url: '/trpc' })],
});

export function App() {
  return (
    <ThemeProvider>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/snapshots/new" element={<NewSnapshot />} />
                <Route path="/snapshots/:id" element={<Snapshot />} />
              </Routes>
            </BrowserRouter>
          </ToastProvider>
        </QueryClientProvider>
      </trpc.Provider>
    </ThemeProvider>
  );
}
