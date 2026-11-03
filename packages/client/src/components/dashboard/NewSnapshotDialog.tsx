import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { trpc } from '../../lib/trpc';
import { MONTH_NAMES, formatMonthYear } from '../../lib/date';
import { t } from '../../lib/strings';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';

// The month after the latest snapshot, or the current month when there is none.
function defaultCreateMonth(snapshots: { year: number; month: number }[]) {
  if (snapshots.length === 0) {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  }
  const latest = snapshots[0];
  return latest.month === 12
    ? { year: latest.year + 1, month: 1 }
    : { year: latest.year, month: latest.month + 1 };
}

export function NewSnapshotDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const utils = trpc.useContext();
  const { data: snapshots = [] } = trpc.dashboard.summary.useQuery();

  const [year, setYear] = useState(0);
  const [month, setMonth] = useState(1);
  const [error, setError] = useState<string | null>(null);

  // Reset to the suggested month every time the dialog opens.
  useEffect(() => {
    if (!open) return;
    const def = defaultCreateMonth(snapshots);
    setYear(def.year);
    setMonth(def.month);
    setError(null);
  }, [open]);

  const taken = new Set(snapshots.map((s) => `${s.year}-${s.month}`));

  const create = trpc.snapshots.create.useMutation({
    onSuccess: (data) => {
      utils.dashboard.summary.invalidate();
      onClose();
      navigate(`/snapshots/${data.id}`, { state: { edit: true } });
    },
    onError: (err) => setError(err.message),
  });

  function handleCreate() {
    if (taken.has(`${year}-${month}`)) {
      setError(t.snapshotExists(formatMonthYear(year, month)));
      return;
    }
    create.mutate({ year, month });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t.newSnapshotDialogTitle}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t.cancel}
          </Button>
          <Button onClick={handleCreate} disabled={create.isLoading}>
            {create.isLoading ? t.creating : t.create}
          </Button>
        </>
      }
    >
      <div className="flex gap-2">
        <select
          aria-label={t.month}
          value={month}
          onChange={(e) => setMonth(Number(e.target.value))}
          className="field flex-1"
        >
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
            <option key={m} value={m} disabled={taken.has(`${year}-${m}`)}>
              {MONTH_NAMES[m]}
              {taken.has(`${year}-${m}`) ? t.monthExistsSuffix : ''}
            </option>
          ))}
        </select>
        <input
          type="number"
          min="1"
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="field w-28"
          aria-label={t.year}
          placeholder={t.year}
        />
      </div>

      {error && (
        <p role="alert" className="mt-3 text-base text-loss">
          {error}
        </p>
      )}
    </Modal>
  );
}
