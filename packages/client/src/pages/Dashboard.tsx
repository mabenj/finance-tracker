import { useState } from 'react';
import { trpc } from '../lib/trpc';
import { SnapshotList } from '../components/dashboard/SnapshotList';
import { MONTH_NAMES, formatMonthYear } from '../lib/date';
import { t } from '../lib/strings';

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
  const { data: snapshots = [], isLoading } = trpc.dashboard.summary.useQuery();
  const utils = trpc.useContext();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const defaultMonth = defaultCreateMonth(snapshots);
  const [selectedYear, setSelectedYear] = useState(defaultMonth.year);
  const [selectedMonth, setSelectedMonth] = useState(defaultMonth.month);

  const takenSet = new Set(snapshots.map((s) => `${s.year}-${s.month}`));

  const createMutation = trpc.snapshots.create.useMutation({
    onSuccess: () => {
      utils.dashboard.summary.invalidate();
      setDialogOpen(false);
      setCreateError(null);
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
    <div className="max-w-2xl mx-auto py-10 px-4">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold tracking-tight">{t.dashboardTitle}</h1>
        <button
          onClick={openDialog}
          className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          {t.newSnapshot}
        </button>
      </div>

      <SnapshotList snapshots={snapshots} isLoading={isLoading} onCreateClick={openDialog} />

      {/* Create dialog */}
      {dialogOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-80">
            <h2 className="text-lg font-semibold mb-4">{t.newSnapshotDialogTitle}</h2>

            <div className="flex gap-2 mb-4">
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option
                    key={m}
                    value={m}
                    disabled={takenSet.has(`${selectedYear}-${m}`)}
                  >
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
                className="w-24 border border-gray-300 rounded px-2 py-1.5 text-sm"
                placeholder={t.year}
              />
            </div>

            {createError && (
              <p className="text-red-600 text-sm mb-3">{createError}</p>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDialogOpen(false)}
                className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900"
              >
                {t.cancel}
              </button>
              <button
                onClick={handleCreate}
                disabled={createMutation.isLoading}
                className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {createMutation.isLoading ? t.creating : t.create}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
