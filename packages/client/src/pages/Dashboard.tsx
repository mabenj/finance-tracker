import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { trpc } from '../lib/trpc';
import { SnapshotList } from '../components/dashboard/SnapshotList';
import { MONTH_NAMES, formatMonthYear } from '../lib/date';
import { t } from '../lib/strings';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { IconPlus } from '../components/ui/icons';

function defaultCreateMonth(snapshots: { year: number; month: number }[]) {
  if (snapshots.length === 0) {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  }
  const latest = snapshots[0];
  const next = latest.month === 12
    ? { year: latest.year + 1, month: 1 }
    : { year: latest.year, month: latest.month + 1 };
  return next;
}

export function Dashboard() {
  const navigate = useNavigate();
  const { data: snapshots = [], isLoading } = trpc.dashboard.summary.useQuery();
  const utils = trpc.useContext();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const defaultMonth = defaultCreateMonth(snapshots);
  const [selectedYear, setSelectedYear] = useState(defaultMonth.year);
  const [selectedMonth, setSelectedMonth] = useState(defaultMonth.month);

  const takenSet = new Set(snapshots.map((s) => `${s.year}-${s.month}`));

  const createMutation = trpc.snapshots.create.useMutation({
    onSuccess: (data) => {
      utils.dashboard.summary.invalidate();
      setCreateError(null);
      navigate(`/snapshots/${data.id}`, { state: { edit: true } });
    },
    onError: (err) => setCreateError(err.message),
  });

  function openDialog() {
    const def = defaultCreateMonth(snapshots);
    setSelectedYear(def.year);
    setSelectedMonth(def.month);
    setCreateError(null);
    setDialogOpen(true);
  }

  function handleCreate() {
    if (takenSet.has(`${selectedYear}-${selectedMonth}`)) {
      setCreateError(t.snapshotExists(formatMonthYear(selectedYear, selectedMonth)));
      return;
    }
    createMutation.mutate({ year: selectedYear, month: selectedMonth });
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:py-12">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          {t.dashboardTitle}
        </h1>
        <Button onClick={openDialog} aria-label={t.newSnapshot} className="shrink-0">
          <IconPlus />
          <span className="hidden sm:inline">{t.newSnapshot}</span>
        </Button>
      </div>

      <SnapshotList snapshots={snapshots} isLoading={isLoading} onCreateClick={openDialog} />

      <Modal
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={t.newSnapshotDialogTitle}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>
              {t.cancel}
            </Button>
            <Button onClick={handleCreate} disabled={createMutation.isLoading}>
              {createMutation.isLoading ? t.creating : t.create}
            </Button>
          </>
        }
      >
        <div className="flex gap-2">
          <select
            aria-label={t.month}
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(Number(e.target.value))}
            className="field flex-1"
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m} disabled={takenSet.has(`${selectedYear}-${m}`)}>
                {MONTH_NAMES[m]}
                {takenSet.has(`${selectedYear}-${m}`) ? t.monthExistsSuffix : ''}
              </option>
            ))}
          </select>

          <input
            type="number"
            min="1"
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="field w-24"
            aria-label={t.year}
            placeholder={t.year}
          />
        </div>

        {createError && (
          <p role="alert" className="mt-3 text-sm text-loss">
            {createError}
          </p>
        )}
      </Modal>
    </div>
  );
}
