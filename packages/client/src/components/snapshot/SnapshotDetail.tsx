import { NetWorthComparison } from '../visualizations/NetWorthComparison';
import { AccountsSection } from './AccountsSection';

interface Account {
  id: number;
  name: string;
  type: string;
  category: string;
  balance: number;
  total_paid: number | null;
}

interface Props {
  snapshot: {
    id: number;
    accounts: Account[];
    previousSnapshot: { accounts: Account[] } | null;
  };
  editMode: boolean;
  onUpdate: () => void;
}

export function SnapshotDetail({ snapshot, editMode, onUpdate }: Props) {
  return (
    <div className="space-y-8">
      <NetWorthComparison
        accounts={snapshot.accounts}
        previousAccounts={snapshot.previousSnapshot?.accounts ?? null}
      />
      <AccountsSection
        snapshotId={snapshot.id}
        accounts={snapshot.accounts}
        editMode={editMode}
        onUpdate={onUpdate}
      />
    </div>
  );
}
