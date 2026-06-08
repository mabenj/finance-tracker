import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { trpc } from '../lib/trpc';
import { SnapshotDetail } from '../components/snapshot/SnapshotDetail';
import { formatMonthYear } from '../lib/date';
import { t } from '../lib/strings';

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
    return <div className="text-center py-16 text-gray-400">{t.loading}</div>;
  }

  if (!data) {
    return (
      <div className="text-center py-16 text-gray-500">
        <p className="mb-4">{t.snapshotNotFound}</p>
        <button onClick={() => navigate('/')} className="text-blue-600 hover:underline text-sm">
          {t.backToDashboard}
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
            {t.dashboardLink}
          </button>
          <h1 className="text-2xl font-bold tracking-tight">
            {formatMonthYear(data.year, data.month)}
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
          {editMode ? t.viewMode : t.editMode}
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
