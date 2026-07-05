import { useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { trpc } from '../lib/trpc';
import { SnapshotDetail } from '../components/snapshot/SnapshotDetail';
import { formatMonthYear } from '../lib/date';
import { t } from '../lib/strings';
import { Button } from '../components/ui/Button';
import { IconArrowLeft, IconPencil, IconEye } from '../components/ui/icons';

export function Snapshot() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [editMode, setEditMode] = useState(
    Boolean((location.state as { edit?: boolean } | null)?.edit)
  );

  const snapshotId = Number(id);
  const { data, isLoading, refetch } = trpc.snapshots.get.useQuery(
    { id: snapshotId },
    { enabled: !isNaN(snapshotId) }
  );

  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10" aria-busy="true" aria-label={t.loading}>
        <div className="mb-8 h-8 w-48 rounded-mark bg-rule motion-safe:animate-pulse" />
        <div className="card h-56 motion-safe:animate-pulse" />
        <div className="mt-8 card h-40 motion-safe:animate-pulse" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <div className="card flex flex-col items-center gap-4 px-6 py-12 text-center">
          <p className="font-display text-lg font-semibold text-ink">{t.snapshotNotFound}</p>
          <Button variant="secondary" onClick={() => navigate('/')}>
            <IconArrowLeft />
            {t.backToDashboard}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:py-10">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/')}
            aria-label={t.dashboardLink}
            className="px-2"
          >
            <IconArrowLeft />
            <span className="hidden sm:inline">{t.dashboardLink}</span>
          </Button>
          <h1 className="truncate font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            {formatMonthYear(data.year, data.month)}
          </h1>
        </div>
        <Button
          variant={editMode ? 'secondary' : 'primary'}
          onClick={() => setEditMode((e) => !e)}
        >
          {editMode ? <IconEye /> : <IconPencil />}
          {editMode ? t.viewMode : t.editMode}
        </Button>
      </div>

      <SnapshotDetail snapshot={data} editMode={editMode} onUpdate={() => refetch()} />
    </div>
  );
}
