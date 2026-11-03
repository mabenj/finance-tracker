import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { trpc } from '../lib/trpc';
import { useToast } from '../lib/toast';
import { t } from '../lib/strings';
import { MONTH_NAMES, formatMonthYear } from '../lib/date';
import { defaultNewMonth, precedingSnapshot, seedDraft, type Draft } from '../lib/snapshot-draft';
import { commitDraft, type CommitApi } from '../lib/commit-draft';
import { AppShell } from '../components/layout/AppShell';
import { SnapshotWizard } from '../components/wizard/SnapshotWizard';
import { useDraft } from '../components/wizard/useDraft';

type YearMonth = { year: number; month: number };

export function NewSnapshot() {
  const { data: snapshots, isLoading } = trpc.dashboard.summary.useQuery();
  const [chosen, setChosen] = useState<YearMonth | null>(null);
  const target = chosen ?? defaultNewMonth(snapshots ?? []);
  const source = snapshots ? precedingSnapshot(snapshots, target) : null;
  const prev = trpc.snapshots.get.useQuery({ id: source?.id ?? 0 }, { enabled: source !== null });
  const ready = !isLoading && (source === null || prev.data !== undefined);

  const initial = useMemo(
    () => (ready ? seedDraft(target.year, target.month, source ? prev.data ?? null : null) : null),
    // Re-seed only when the month or its source snapshot changes, not on refetches.
    [ready, target.year, target.month, source?.id]
  );

  return (
    <AppShell bar={<span className="text-base text-ink-muted">{t.newSnapshot}</span>}>
      {initial ? (
        <DraftedWizard
          key={`${target.year}-${target.month}`}
          initial={initial}
          taken={new Set((snapshots ?? []).map((s) => `${s.year}-${s.month}`))}
          years={yearRange(snapshots ?? [], target.year)}
          onMonthChange={setChosen}
        />
      ) : (
        <div aria-busy="true" aria-label={t.loading}>
          <div className="mb-8 h-10 w-56 rounded-control bg-rule motion-safe:animate-pulse" />
          <div className="card h-96 motion-safe:animate-pulse" />
        </div>
      )}
    </AppShell>
  );
}

function yearRange(snapshots: YearMonth[], current: number) {
  const known = [...snapshots.map((s) => s.year), current, new Date().getFullYear()];
  const from = Math.min(...known) - 1;
  const to = Math.max(...known) + 1;
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

interface DraftedProps {
  initial: Draft;
  taken: Set<string>;
  years: number[];
  onMonthChange: (ym: YearMonth) => void;
}

function DraftedWizard({ initial, taken, years, onMonthChange }: DraftedProps) {
  const actions = useDraft(initial);
  const { year, month } = initial;
  const utils = trpc.useContext();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [committing, setCommitting] = useState(false);
  const monthLabel = formatMonthYear(year, month);
  const exists = taken.has(`${year}-${month}`);

  // Typed-in figures live only in memory until "Luo katsaus".
  useEffect(() => {
    if (!actions.dirty || committing) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [actions.dirty, committing]);

  async function commit() {
    const c = utils.client;
    const api: CommitApi = {
      createCategory: (i) => c.categories.create.mutate(i),
      upsertAccount: (i) => c.accounts.upsert.mutate(i),
      deleteAccount: (i) => c.accounts.delete.mutate(i),
      upsertIncome: (i) => c.incomes.upsert.mutate(i),
      deleteIncome: (i) => c.incomes.delete.mutate(i),
      upsertExpense: (i) => c.expenses.upsert.mutate(i),
      deleteExpense: (i) => c.expenses.delete.mutate(i),
    };

    setCommitting(true);
    let id: number;
    try {
      id = (await c.snapshots.create.mutate({ year, month })).id;
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err));
      setCommitting(false);
      return;
    }

    // The snapshot exists from here on; a later failure leaves it partly filled,
    // so open it in edit mode rather than leaving the user on a stale wizard.
    let complete = true;
    try {
      await commitDraft(actions.draft, await c.snapshots.get.query({ id }), api);
      showToast(t.snapshotCreated(monthLabel), 'success');
    } catch {
      complete = false;
      showToast(t.snapshotPartiallySaved);
    }
    utils.dashboard.summary.invalidate();
    navigate(`/snapshots/${id}`, { state: { edit: !complete } });
  }

  const monthPicker = (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <select
          aria-label={t.month}
          className="field w-40"
          value={month}
          onChange={(e) => onMonthChange({ year, month: Number(e.target.value) })}
        >
          {MONTH_NAMES.slice(1).map((name, i) => (
            <option key={name} value={i + 1} disabled={taken.has(`${year}-${i + 1}`)}>
              {name}
              {taken.has(`${year}-${i + 1}`) ? t.monthExistsSuffix : ''}
            </option>
          ))}
        </select>
        <select aria-label={t.year} className="field w-28" value={year} onChange={(e) => onMonthChange({ year: Number(e.target.value), month })}>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
      {exists ? (
        <p role="alert" className="text-sm text-loss">{t.snapshotExists(monthLabel)}</p>
      ) : (
        actions.dirty && <p className="text-sm text-ink-faint">{t.wizardMonthChangeHint}</p>
      )}
    </div>
  );

  return (
    <SnapshotWizard
      actions={actions}
      monthLabel={monthLabel}
      monthPicker={monthPicker}
      committing={committing}
      canCommit={!exists}
      onCommit={commit}
    />
  );
}
