import { NetWorthComparison } from '../visualizations/NetWorthComparison';
import { AccountsSection } from './AccountsSection';
import { IncomeSection } from './IncomeSection';
import { ExpenseTree } from './ExpenseTree';

interface Account {
  id: number;
  name: string;
  type: string;
  category: string;
  balance: number;
  total_paid: number | null;
}

interface Income {
  id: number;
  name: string;
  amount: number;
  category: string;
  recurring: number;
}

interface Category {
  id: number;
  name: string;
  parent_id: number | null;
}

interface Expense {
  id: number;
  name: string;
  amount: number;
  category_id: number;
  recurring: number;
}

interface Props {
  snapshot: {
    id: number;
    accounts: Account[];
    incomes: Income[];
    categories: Category[];
    expenses: Expense[];
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

      <IncomeSection
        snapshotId={snapshot.id}
        incomes={snapshot.incomes}
        editMode={editMode}
        onUpdate={onUpdate}
      />

      <ExpenseTree
        snapshotId={snapshot.id}
        expenses={snapshot.expenses}
        categories={snapshot.categories}
        editMode={editMode}
        onUpdate={onUpdate}
      />
    </div>
  );
}
