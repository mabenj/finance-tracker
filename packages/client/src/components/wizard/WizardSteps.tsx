import { useContext, useState } from 'react';
import { t } from '../../lib/strings';
import { draftProblems, isFilled, itemsOf, sortedCategories, type Phase } from '../../lib/snapshot-draft';
import { Button } from '../ui/Button';
import { Figure } from '../ui/Figure';
import { IconPlus } from '../ui/icons';
import { MoneyInput } from '../ui/MoneyInput';
import { CategorySelect } from './CategorySelect';
import { ColumnHeads, EditingContext, WizardRow, rowSubtitle } from './WizardRow';
import type { DraftActions } from './useDraft';

/** A dashed "add a row" strip; Enter in any of its fields submits. */
function AddBar({ title, onAdd, children }: { title: string; onAdd: () => void; children: React.ReactNode }) {
  return (
    <div
      className="mt-4 rounded-card border border-dashed border-rule-strong p-3"
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') { e.preventDefault(); onAdd(); }
      }}
    >
      <div className="mb-2 text-sm font-medium text-ink-muted">{title}</div>
      <div className="flex flex-col gap-2 sm:flex-row">
        {children}
        <Button onClick={onAdd}>
          <IconPlus />
          {t.add}
        </Button>
      </div>
    </div>
  );
}

/** Name + amount state for an AddBar; `take` returns the values and clears them, or null if incomplete. */
function useNewRow() {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState<number | null>(null);
  const take = () => {
    if (!name.trim() || amount === null) return null;
    setName('');
    setAmount(null);
    return { name: name.trim(), value: amount };
  };
  return { name, setName, amount, setAmount, take };
}

export function AccountsStep({ actions }: { actions: DraftActions }) {
  const accounts = itemsOf(actions.draft, 'accounts');
  const { setEditing } = useContext(EditingContext);
  const row = useNewRow();

  function add() {
    const taken = row.take();
    if (!taken) return;
    const key = actions.add({ phase: 'accounts', ...taken, recurrence: 'none', type: 'asset', category: '', totalPaid: null });
    setEditing(key); // type and category still need setting
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => accounts.filter((a) => !isFilled(a)).forEach((a) => actions.update(a.key, { value: a.prev }))}
        >
          {t.fillBlankBalances}
        </Button>
      </div>
      {(['asset', 'liability'] as const).map((type) => {
        const rows = accounts.filter((a) => a.type === type);
        if (rows.length === 0) return null;
        return (
          <div key={type} className="mb-6">
            <h3 className="mb-2 text-sm font-semibold text-ink">{type === 'asset' ? t.assets : t.liabilities}</h3>
            <ColumnHeads />
            {rows.map((a) => <WizardRow key={a.key} actions={actions} item={a} />)}
          </div>
        );
      })}
      <AddBar title={t.addAccount} onAdd={add}>
        <input className="field flex-1" placeholder={t.accountName} aria-label={t.accountName} value={row.name} onChange={(e) => row.setName(e.target.value)} />
        <MoneyInput className="sm:w-32" cents={row.amount} onChange={row.setAmount} aria-label={t.balance} />
      </AddBar>
    </>
  );
}

export function IncomesStep({ actions }: { actions: DraftActions }) {
  const row = useNewRow();
  const incomes = itemsOf(actions.draft, 'incomes');

  function add() {
    const taken = row.take();
    if (taken) actions.add({ phase: 'incomes', ...taken, recurrence: 'none', category: t.defaultIncomeCategory });
  }

  return (
    <>
      {incomes.length > 0 && <ColumnHeads />}
      {incomes.map((i) => <WizardRow key={i.key} actions={actions} item={i} />)}
      <AddBar title={t.addIncome} onAdd={add}>
        <input className="field flex-1" placeholder={t.otherIncomePlaceholder} aria-label={t.incomeName} value={row.name} onChange={(e) => row.setName(e.target.value)} />
        <MoneyInput className="sm:w-32" cents={row.amount} onChange={row.setAmount} aria-label={t.amount} />
      </AddBar>
    </>
  );
}

export function ExpensesStep({ actions }: { actions: DraftActions }) {
  const d = actions.draft;
  const cats = sortedCategories(d.categories);
  const expenses = itemsOf(d, 'expenses');
  const row = useNewRow();
  const [categoryId, setCategoryId] = useState<number | undefined>(cats[0]?.id);

  function add() {
    if (categoryId === undefined) return;
    const taken = row.take();
    if (taken) actions.add({ phase: 'expenses', ...taken, recurrence: 'none', categoryId });
  }

  return (
    <>
      <AddBar title={t.recordExpense} onAdd={add}>
        <input className="field flex-1" placeholder={t.name} aria-label={t.expenseName} value={row.name} onChange={(e) => row.setName(e.target.value)} />
        <CategorySelect actions={actions} className="sm:w-56" value={categoryId} onChange={setCategoryId} />
        <MoneyInput className="sm:w-32" cents={row.amount} onChange={row.setAmount} aria-label={t.amount} />
      </AddBar>
      <div className="mt-6">
        {expenses.length > 0 && <ColumnHeads />}
        {cats.map((c) => {
          const rows = expenses.filter((e) => e.categoryId === c.id);
          if (rows.length === 0) return null;
          return (
            <div key={c.id} className="mb-4">
              <div className="flex justify-between rounded-mark bg-paper px-2 py-1.5 text-sm font-semibold text-ink">
                <span>{c.path}</span>
                <Figure cents={rows.reduce((s, r) => s + (r.value ?? 0), 0)} />
              </div>
              {rows.map((e) => <WizardRow key={e.key} actions={actions} item={e} />)}
            </div>
          );
        })}
      </div>
    </>
  );
}

export function ReviewStep({ actions, goTo }: { actions: DraftActions; goTo: (phase: Phase) => void }) {
  const d = actions.draft;
  const problems = draftProblems(d);
  const unfilled = d.items.filter((i) => !isFilled(i));
  const added = d.items.filter((i) => i.carryKey === null);
  const carrying = (p: Phase) => itemsOf(d, p).filter((i) => i.recurrence !== 'none').length;
  const link = (phase: Phase, label: string) => (
    <button className="text-accent-ink hover:underline" onClick={() => goTo(phase)}>
      {t.wizardSteps[phase]}: {label || '—'}
    </button>
  );

  return (
    <div className="space-y-6">
      {problems.length > 0 && (
        <div role="alert" className="rounded-card bg-loss-wash p-4">
          <div className="mb-2 font-semibold text-loss">{t.problemsHeading}</div>
          <ul className="space-y-1 text-base">
            {problems.map(({ item, problem }) => (
              <li key={`${item.key}-${problem}`}>
                {link(item.phase, item.name)}
                <span className="text-ink-muted"> — {problem === 'name' ? t.problemName : t.problemCategory}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {unfilled.length > 0 ? (
        <div className="rounded-card bg-accent-wash p-4">
          <div className="mb-2 font-semibold text-accent-ink">{t.unfilledRows(unfilled.length)}</div>
          <ul className="space-y-1 text-base">
            {unfilled.map((m) => (
              <li key={m.key}>
                {link(m.phase, m.name)}
                <span className="text-ink-muted">{m.phase === 'accounts' ? t.keepsLastBalance : t.savedAsZero}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="rounded-card bg-gain-wash p-4 font-semibold text-gain">{t.allRowsFilled}</div>
      )}

      {added.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-ink">{t.newRowsThisMonth(added.length)}</h3>
          {added.map((n) => (
            <div key={n.key} className="flex justify-between gap-4 border-b border-rule py-1.5 text-base last:border-0">
              <span className="min-w-0 truncate">
                {n.name} <span className="text-ink-muted">· {t.wizardSteps[n.phase]} · {rowSubtitle(actions, n)}</span>
              </span>
              <Figure cents={n.value ?? 0} />
            </div>
          ))}
        </div>
      )}

      <div>
        <h3 className="mb-1 text-sm font-semibold text-ink">{t.carriesHeading}</h3>
        <p className="text-base text-ink-muted">
          {t.carriesSummary(itemsOf(d, 'accounts').length, carrying('incomes'), carrying('expenses'))}
        </p>
      </div>
    </div>
  );
}
