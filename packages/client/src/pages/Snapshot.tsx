import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { trpc } from '../lib/trpc';
import { SnapshotDetail } from '../components/snapshot/SnapshotDetail';
import { AppShell } from '../components/layout/AppShell';
import { formatMonthYear } from '../lib/date';
import { t } from '../lib/strings';
import { Button } from '../components/ui/Button';
import { IconButton } from '../components/ui/IconButton';
import { IconCheck, IconChevronLeft, IconPencil } from '../components/ui/icons';

// Older / newer month arrows in the top bar, following the dashboard's order.
function MonthPager({ snapshotId }: { snapshotId: number }) {
  const navigate = useNavigate();
  const { data: snapshots = [] } = trpc.dashboard.summary.useQuery();
  const i = snapshots.findIndex((s) => s.id === snapshotId);
  const newer = i > 0 ? snapshots[i - 1] : null;
  const older = i >= 0 && i < snapshots.length - 1 ? snapshots[i + 1] : null;

  return (
    <div className="flex items-center gap-1">
      <IconButton disabled={!older} onClick={() => older && navigate(`/snapshots/${older.id}`)} aria-label={t.previousMonth} title={t.previousMonth}>
        <IconChevronLeft />
      </IconButton>
      <IconButton disabled={!newer} onClick={() => newer && navigate(`/snapshots/${newer.id}`)} aria-label={t.nextMonth} title={t.nextMonth}>
        <IconChevronLeft className="rotate-180" />
      </IconButton>
      <span className="ml-2 hidden truncate text-base text-ink-muted sm:inline">{t.snapshotLabel}</span>
    </div>
  );
}

export function Snapshot() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const utils = trpc.useContext();
  const [editMode, setEditMode] = useState(
    Boolean((location.state as { edit?: boolean } | null)?.edit)
  );

  const snapshotId = Number(id);
  const { data, isLoading, refetch } = trpc.snapshots.get.useQuery(
    { id: snapshotId },
    { enabled: !isNaN(snapshotId) }
  );

  // Leaving a month (via sidebar or pager) ends editing unless the new route asks for it.
  useEffect(() => {
    setEditMode(Boolean((location.state as { edit?: boolean } | null)?.edit));
  }, [snapshotId]);

  function handleUpdate() {
    refetch();
    // Net worth changes move the sidebar's up/down markers.
    utils.dashboard.summary.invalidate();
  }

  const editToggle = data && (
    <Button variant={editMode ? 'secondary' : 'primary'} onClick={() => setEditMode((e) => !e)}>
      {editMode ? <IconCheck /> : <IconPencil />}
      {editMode ? t.done : t.edit}
    </Button>
  );

  return (
    <AppShell bar={<MonthPager snapshotId={snapshotId} />} actions={editToggle}>
      {isLoading ? (
        <div aria-busy="true" aria-label={t.loading}>
          <div className="mb-8 h-10 w-56 rounded-control bg-rule motion-safe:animate-pulse" />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="card h-32 motion-safe:animate-pulse" />
            ))}
          </div>
          <div className="card mt-10 h-72 motion-safe:animate-pulse" />
        </div>
      ) : !data ? (
        <div className="card mx-auto flex max-w-md flex-col items-center gap-4 px-6 py-12 text-center">
          <p className="text-lg font-semibold text-ink">{t.snapshotNotFound}</p>
          <Button variant="secondary" onClick={() => navigate('/')}>
            {t.backToDashboard}
          </Button>
        </div>
      ) : (
        <>
          <h1 className="mb-8 text-3xl font-bold tracking-tight text-ink sm:text-4xl">
            {formatMonthYear(data.year, data.month)}
          </h1>
          <SnapshotDetail key={data.id} snapshot={data} editMode={editMode} onUpdate={handleUpdate} />
        </>
      )}
    </AppShell>
  );
}
