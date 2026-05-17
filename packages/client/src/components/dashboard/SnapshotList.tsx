import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { trpc } from '../../lib/trpc';
import { useToast } from '../../lib/toast';
import { formatEurCents, formatDeltaCents } from '../../lib/currency';
import { computeNetWorthDelta } from '../../lib/net-worth';

const MONTH_NAMES = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

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
    return <div className="text-center py-12 text-gray-400">Loading...</div>;
  }

  if (snapshots.length === 0) {
    return (
      <div className="text-center py-16 text-gray-500">
        <p className="text-lg font-medium mb-3">No snapshots yet</p>
        <button
          onClick={onCreateClick}
          className="bg-blue-600 text-white px-5 py-2 rounded-md text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          Create your first snapshot
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="divide-y divide-gray-200 border border-gray-200 rounded-lg overflow-hidden">
        {snapshots.map((snap) => {
          const deltaInfo = snap.previousNetWorth !== null
            ? computeNetWorthDelta(snap.netWorth, snap.previousNetWorth)
            : null;

          return (
            <div key={snap.id} className="flex items-center justify-between px-4 py-3 bg-white hover:bg-gray-50">
              <button
                onClick={() => navigate(`/snapshots/${snap.id}`)}
                className="font-medium hover:text-blue-600 text-left min-w-[130px]"
              >
                {MONTH_NAMES[snap.month]} {snap.year}
              </button>

              <div className="flex items-center gap-4 flex-1 justify-end mr-4">
                <span className="text-sm tabular-nums font-medium text-gray-800">
                  {formatEurCents(snap.netWorth)}
                </span>
                {deltaInfo !== null ? (
                  <span
                    className={`text-sm tabular-nums ${
                      deltaInfo.absolute >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}
                  >
                    {formatDeltaCents(deltaInfo.absolute)}
                    {deltaInfo.percentage !== null && (
                      <span className="ml-1 text-xs">
                        ({deltaInfo.absolute >= 0 ? '+' : ''}{deltaInfo.percentage.toFixed(1)}%)
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="text-sm text-gray-400 italic">—</span>
                )}
              </div>

              <button
                onClick={() => setPendingDeleteId(snap.id)}
                className="text-sm text-red-600 hover:text-red-800"
              >
                Delete
              </button>
            </div>
          );
        })}
      </div>

      {/* Delete confirmation dialog */}
      {pendingSnap && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-80">
            <h2 className="text-base font-semibold mb-2">Delete snapshot?</h2>
            <p className="text-sm text-gray-600 mb-5">
              This will permanently delete the snapshot for{' '}
              <span className="font-medium">
                {MONTH_NAMES[pendingSnap.month]} {pendingSnap.year}
              </span>{' '}
              and all its accounts, income, and expenses.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setPendingDeleteId(null)}
                disabled={deleteMutation.isLoading}
                className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteMutation.mutate({ id: pendingSnap.id })}
                disabled={deleteMutation.isLoading}
                className="bg-red-600 text-white px-4 py-1.5 rounded text-sm font-medium hover:bg-red-700 disabled:opacity-50"
              >
                {deleteMutation.isLoading ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
