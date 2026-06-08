import { useState, useEffect } from 'react';
import { NetWorthComparison } from '../visualizations/NetWorthComparison';
import { SankeyDiagram } from '../visualizations/SankeyDiagram';
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
  const [sankeyOpen, setSankeyOpen] = useState(false);
  // Spec §6.1 / §6.2 E: Sankey must be collapsed when entering edit mode.
  useEffect(() => {
    if (editMode) setSankeyOpen(false);
  }, [editMode]);

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

      {/* Sankey Diagram */}
      {editMode ? (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden relative left-1/2 -translate-x-1/2 w-[min(96rem,calc(100vw-2rem))]">
          <button
            className="w-full flex items-center justify-between px-6 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            onClick={() => setSankeyOpen((o) => !o)}
          >
            <span>Income / Expense Flow (Sankey)</span>
            <span className="text-gray-400">{sankeyOpen ? '▲' : '▼'}</span>
          </button>
          {sankeyOpen && (
            <div className="px-6 pb-6">
              <SankeyDiagram
                incomes={snapshot.incomes}
                expenses={snapshot.expenses}
                categories={snapshot.categories}
              />
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg p-6 relative left-1/2 -translate-x-1/2 w-[min(96rem,calc(100vw-2rem))]">
          <h2 className="text-base font-semibold text-gray-700 mb-4">
            Income / Expense Flow
          </h2>
          <SankeyDiagram
            incomes={snapshot.incomes}
            expenses={snapshot.expenses}
            categories={snapshot.categories}
          />
        </div>
      )}
    </div>
  );
}
