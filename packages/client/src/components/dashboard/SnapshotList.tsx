import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { trpc } from '../../lib/trpc';
import { useToast } from '../../lib/toast';
import { computeNetWorthDelta } from '../../lib/net-worth';
import { formatMonthYear } from '../../lib/date';
import { t } from '../../lib/strings';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { Figure } from '../ui/Figure';
import { Delta } from '../ui/Delta';
import { IconTrash, IconPlus } from '../ui/icons';

interface Snapshot {
  id: number;
  year: number;
  month: number;
  netWorth: number;
  previousNetWorth: number | null;
  delta: number | null;
}

interface Props {
  snapshots: Snapshot[];
  isLoading: boolean;
  onCreateClick: () => void;
}

// Shared column widths keep every figure in a straight ledger column across rows.
const COL_NET = 'w-36 text-right';
const COL_CHANGE = 'w-48 text-right';

export function SnapshotList({ snapshots, isLoading, onCreateClick }: Props) {
  const navigate = useNavigate();
  const utils = trpc.useContext();
  const { showToast } = useToast();
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);

  const deleteMutation = trpc.snapshots.delete.useMutation({
    onSuccess: () => {
      utils.dashboard.summary.invalidate();
      setPendingDeleteId(null);
    },
    onError: (err) => showToast(err.message),
  });

  const pendingSnap = snapshots.find((s) => s.id === pendingDeleteId) ?? null;

  if (isLoading) {
    return (
      <div className="card overflow-hidden" aria-busy="true" aria-label={t.loading}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center justify-between border-b border-rule px-5 py-4 last:border-0"
          >
            <div className="h-4 w-32 rounded-mark bg-rule motion-safe:animate-pulse" />
            <div className="h-4 w-24 rounded-mark bg-rule motion-safe:animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  if (snapshots.length === 0) {
    return (
      <div className="card flex flex-col items-center gap-4 px-6 py-14 text-center">
        <div
          className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-wash text-accent-ink"
          aria-hidden="true"
        >
          <IconPlus className="w-6 h-6" />
        </div>
        <div>
          <p className="text-lg font-semibold text-ink">{t.noSnapshots}</p>
          <p className="mt-1 max-w-xs text-base text-ink-muted">{t.noSnapshotsHint}</p>
        </div>
        <Button onClick={onCreateClick}>
          <IconPlus />
          {t.createFirstSnapshot}
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="card overflow-hidden">
        <div className="hidden items-center border-b border-rule px-5 py-3 text-sm font-medium text-ink-muted sm:flex">
          <span className="flex-1">{t.month}</span>
          <span className={COL_NET}>{t.netWorth}</span>
          <span className={COL_CHANGE}>{t.change}</span>
          <span className="w-12" />
        </div>

        <ul className="divide-y divide-rule">
          {snapshots.map((snap) => {
            const deltaInfo =
              snap.previousNetWorth !== null
                ? computeNetWorthDelta(snap.netWorth, snap.previousNetWorth)
                : null;

            return (
              <li key={snap.id} className="group flex items-stretch">
                <button
                  onClick={() => navigate(`/snapshots/${snap.id}`)}
                  className="flex flex-1 flex-wrap items-center gap-x-2 gap-y-1 px-5 py-4 text-left text-base transition-colors hover:bg-paper"
                >
                  <span className="min-w-[7rem] flex-1 truncate font-medium text-ink transition-colors group-hover:text-accent-ink">
                    {formatMonthYear(snap.year, snap.month)}
                  </span>
                  <span className={COL_NET}>
                    <Figure cents={snap.netWorth} />
                  </span>
                  <span className={`${COL_CHANGE} flex justify-end`}>
                    {deltaInfo !== null ? (
                      <Delta absolute={deltaInfo.absolute} percentage={deltaInfo.percentage} size="sm" />
                    ) : (
                      <span className="text-ink-faint">—</span>
                    )}
                  </span>
                </button>

                <button
                  onClick={() => setPendingDeleteId(snap.id)}
                  title={t.delete}
                  aria-label={`${t.delete}: ${formatMonthYear(snap.year, snap.month)}`}
                  className="flex w-12 shrink-0 items-center justify-center text-ink-faint transition-colors hover:bg-loss-wash hover:text-loss"
                >
                  <IconTrash className="w-4 h-4" />
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <Modal
        open={pendingSnap !== null}
        onClose={() => setPendingDeleteId(null)}
        title={t.deleteSnapshotTitle}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setPendingDeleteId(null)}
              disabled={deleteMutation.isLoading}
            >
              {t.cancel}
            </Button>
            <Button
              variant="danger"
              onClick={() => pendingSnap && deleteMutation.mutate({ id: pendingSnap.id })}
              disabled={deleteMutation.isLoading}
            >
              {deleteMutation.isLoading ? t.deleting : t.delete}
            </Button>
          </>
        }
      >
        {pendingSnap && t.deleteSnapshotBody(formatMonthYear(pendingSnap.year, pendingSnap.month))}
      </Modal>
    </>
  );
}
