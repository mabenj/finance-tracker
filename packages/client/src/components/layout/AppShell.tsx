import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { trpc } from '../../lib/trpc';
import { MONTH_NAMES } from '../../lib/date';
import { cn } from '../../lib/cn';
import { t } from '../../lib/strings';
import { ThemeToggle } from '../ui/ThemeToggle';
import { IconButton } from '../ui/IconButton';
import { IconMenu, IconPlus, IconX } from '../ui/icons';
import { NewSnapshotDialog } from '../dashboard/NewSnapshotDialog';

// Lets any page inside the shell open the "new snapshot" dialog.
const NewSnapshotContext = createContext<() => void>(() => {});
export const useOpenNewSnapshot = () => useContext(NewSnapshotContext);

interface Props {
  /** Left side of the sticky top bar (e.g. month pager). */
  bar?: ReactNode;
  /** Right side of the top bar, after the theme toggle. */
  actions?: ReactNode;
  children: ReactNode;
}

function Sidebar({ onNew }: { onNew: () => void }) {
  const { pathname } = useLocation();
  const { data: snapshots = [] } = trpc.dashboard.summary.useQuery();

  const item = 'flex w-full items-center gap-2 rounded-control px-3 py-2.5 text-base transition-colors';
  const active = 'bg-gradient-to-br from-accent to-accent-2 font-medium text-onFill shadow-sheet';
  const idle = 'text-ink hover:bg-paper';

  return (
    <div className="flex h-full flex-col">
      <Link to="/" className="flex h-16 shrink-0 items-center gap-2.5 px-5">
        <span className="h-8 w-8 rounded-control bg-gradient-to-br from-accent to-accent-2" aria-hidden="true" />
        <span className="text-lg font-bold text-ink">{t.appName}</span>
      </Link>

      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        <Link to="/" className={cn(item, 'mt-2', pathname === '/' ? active : idle)}>
          {t.overview}
        </Link>

        <div className="px-3 pb-2 pt-6 text-sm font-medium text-ink-muted">{t.dashboardTitle}</div>
        <div className="space-y-1">
          {snapshots.map((s) => {
            const isActive = pathname === `/snapshots/${s.id}`;
            return (
              <Link key={s.id} to={`/snapshots/${s.id}`} className={cn(item, 'justify-between', isActive ? active : idle)}>
                <span>
                  {MONTH_NAMES[s.month]} <span className={isActive ? 'opacity-75' : 'text-ink-faint'}>{s.year}</span>
                </span>
                {s.delta !== null && s.delta !== 0 && (
                  <span
                    className={cn('text-xs', isActive ? 'opacity-75' : s.delta > 0 ? 'text-gain' : 'text-loss')}
                    aria-hidden="true"
                  >
                    {s.delta > 0 ? '▲' : '▼'}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </nav>

      <div className="shrink-0 border-t border-rule p-3">
        <button onClick={onNew} className={cn(item, 'font-medium text-accent-ink hover:bg-accent-wash')}>
          <IconPlus />
          {t.newSnapshot}
        </button>
      </div>
    </div>
  );
}

// The app frame: a month sidebar (a drawer below lg), a sticky translucent top
// bar, and a centred content column.
export function AppShell({ bar, actions, children }: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => setDrawerOpen(false), [pathname]);

  const openNew = () => {
    setDrawerOpen(false);
    setNewOpen(true);
  };

  return (
    <NewSnapshotContext.Provider value={openNew}>
      <div className="min-h-screen bg-paper text-ink">
        <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-rule bg-side lg:block">
          <Sidebar onNew={openNew} />
        </aside>

        {drawerOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0" style={{ backgroundColor: 'var(--overlay)' }} onClick={() => setDrawerOpen(false)} />
            <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-side shadow-pop">
              <IconButton onClick={() => setDrawerOpen(false)} aria-label={t.closeMenu} className="absolute right-3 top-4">
                <IconX />
              </IconButton>
              <Sidebar onNew={openNew} />
            </aside>
          </div>
        )}

        <div className="lg:pl-64">
          <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-rule bg-topbar px-4 backdrop-blur sm:px-8">
            <div className="flex min-w-0 items-center gap-1">
              <IconButton onClick={() => setDrawerOpen(true)} aria-label={t.openMenu} className="-ml-1.5 lg:hidden">
                <IconMenu />
              </IconButton>
              {bar}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <ThemeToggle />
              {actions}
            </div>
          </header>

          <main className="mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-8">{children}</main>
        </div>

        <NewSnapshotDialog open={newOpen} onClose={() => setNewOpen(false)} />
      </div>
    </NewSnapshotContext.Provider>
  );
}
