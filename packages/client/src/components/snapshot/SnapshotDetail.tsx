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

export function SnapshotDetail({ snapshot, editMode, onUpdate }: Props) {
  const [sankeyOpen, setSankeyOpen] = useState(false);
  // Spec §6.1 / §6.2 E: Sankey must be collapsed when entering edit mode.
  useEffect(() => {
    if (editMode) setSankeyOpen(false);
  }, [editMode]);

  const income = (
    <IncomeSection
      snapshotId={snapshot.id}
      incomes={snapshot.incomes}
      editMode={editMode}
      onUpdate={onUpdate}
    />
  );
  const expenses = (
    <ExpenseTree
      snapshotId={snapshot.id}
      expenses={snapshot.expenses}
      categories={snapshot.categories}
      editMode={editMode}
      onUpdate={onUpdate}
    />
  );

  return (
    <div className="space-y-10">
      <NetWorthComparison
        accounts={snapshot.accounts}
        previousAccounts={snapshot.previousSnapshot?.accounts ?? null}
        incomes={snapshot.incomes}
        expenses={snapshot.expenses}
      />

      <AccountsSection
        snapshotId={snapshot.id}
        accounts={snapshot.accounts}
        previousAccounts={snapshot.previousSnapshot?.accounts ?? null}
        editMode={editMode}
        onUpdate={onUpdate}
      />

      {/* Side by side when reading; stacked while editing so the inline forms have room. */}
      {editMode ? (
        <>
          {income}
          {expenses}
        </>
      ) : (
        <div className="grid gap-10 xl:grid-cols-5">
          <div className="xl:col-span-2">{income}</div>
          <div className="xl:col-span-3">{expenses}</div>
        </div>
      )}

      {/* Sankey Diagram — collapsible while editing, always shown when viewing */}
      {editMode ? (
        <div className="card overflow-hidden">
          <button
            className="flex w-full items-center justify-between px-5 py-4 text-base font-semibold text-ink transition-colors hover:bg-paper"
            onClick={() => setSankeyOpen((o) => !o)}
            aria-expanded={sankeyOpen}
          >
            <span>{t.sankeyHeadingCollapsible}</span>
            <IconChevron expanded={sankeyOpen} className="w-5 h-5 text-ink-muted" />
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
        <section>
          <h2 className="mb-4 text-xl font-bold text-ink">{t.sankeyHeading}</h2>
          <div className="card p-6">
            <SankeyDiagram
              incomes={snapshot.incomes}
              expenses={snapshot.expenses}
              categories={snapshot.categories}
            />
          </div>
        </section>
      )}
    </div>
  );
}
