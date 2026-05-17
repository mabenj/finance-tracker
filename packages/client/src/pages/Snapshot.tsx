import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { trpc } from '../lib/trpc';
import { SnapshotDetail } from '../components/snapshot/SnapshotDetail';

const MONTH_NAMES = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function Snapshot() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [editMode, setEditMode] = useState(false);

  const snapshotId = Number(id);
  const { data, isLoading, refetch } = trpc.snapshots.get.useQuery(
    { id: snapshotId },
    { enabled: !isNaN(snapshotId) }
  );

  if (isLoading) {
    return <div className="text-center py-16 text-gray-400">Loading…</div>;
  }

  if (!data) {
    return (
      <div className="text-center py-16 text-gray-500">
        <p className="mb-4">Snapshot not found.</p>
        <button onClick={() => navigate('/')} className="text-blue-600 hover:underline text-sm">
          ← Back to dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto py-10 px-4">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/')}
            className="text-gray-400 hover:text-gray-700 text-sm"
          >
            ← Dashboard
          </button>
          <h1 className="text-2xl font-bold tracking-tight">
            {MONTH_NAMES[data.month]} {data.year}
          </h1>
        </div>
        <button
          onClick={() => setEditMode((e) => !e)}
          className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
            editMode
              ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {editMode ? 'View Mode' : 'Edit Mode'}
        </button>
      </div>

      <SnapshotDetail
        snapshot={data}
        editMode={editMode}
        onUpdate={() => refetch()}
      />
    </div>
  );
}
