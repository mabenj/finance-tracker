import { useState, useEffect } from 'react';
import { NetWorthComparison } from '../visualizations/NetWorthComparison';
import { SankeyDiagram } from '../visualizations/SankeyDiagram';
import { AccountsSection } from './AccountsSection';
import { IncomeSection } from './IncomeSection';
import { ExpenseTree } from './ExpenseTree';
import type { Recurrence } from './RecurrenceControl';
import { t } from '../../lib/strings';
import { IconChevron } from '../ui/icons';

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
  recurrence: Recurrence;
  carried_amount: number | null;
}

interface Category {
  id: number;
  name: string;
  parent_id: number | null;
  position: number;
}

interface Expense {
  id: number;
  name: string;
  amount: number;
  category_id: number;
  recurrence: Recurrence;
  position: number;
  carried_amount: number | null;
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

// Full-bleed width for the Sankey so wide flows have room to breathe.
const FULL_BLEED = 'relative left-1/2 -translate-x-1/2 w-[min(96rem,calc(100vw-2rem))]';

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

      {/* Sankey Diagram — collapsible while editing, always shown when viewing */}
      {editMode ? (
        <div className={`card overflow-hidden ${FULL_BLEED}`}>
          <button
            className="flex w-full items-center justify-between px-6 py-3 text-sm font-medium text-ink transition-colors hover:bg-paper"
            onClick={() => setSankeyOpen((o) => !o)}
            aria-expanded={sankeyOpen}
          >
            <span className="font-display">{t.sankeyHeadingCollapsible}</span>
            <IconChevron expanded={sankeyOpen} className="w-4 h-4 text-ink-muted" />
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
        <div className={`card p-6 ${FULL_BLEED}`}>
          <h2 className="mb-4 font-display text-lg font-semibold text-ink">{t.sankeyHeading}</h2>
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
