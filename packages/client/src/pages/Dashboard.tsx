import { trpc } from '../lib/trpc';
import { SnapshotList } from '../components/dashboard/SnapshotList';
import { AppShell, useOpenNewSnapshot } from '../components/layout/AppShell';
import { t } from '../lib/strings';
import { Button } from '../components/ui/Button';
import { IconPlus } from '../components/ui/icons';

function DashboardContent() {
  const { data: snapshots = [], isLoading } = trpc.dashboard.summary.useQuery();
  const openNew = useOpenNewSnapshot();

  return (
    <>
      <div className="mb-8 flex items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">{t.dashboardTitle}</h1>
        <Button onClick={openNew} aria-label={t.newSnapshot}>
          <IconPlus />
          <span className="hidden sm:inline">{t.newSnapshot}</span>
        </Button>
      </div>
      <SnapshotList snapshots={snapshots} isLoading={isLoading} onCreateClick={openNew} />
    </>
  );
}

export function Dashboard() {
  return (
    <AppShell bar={<span className="text-base text-ink-muted">{t.overview}</span>}>
      <DashboardContent />
    </AppShell>
  );
}
