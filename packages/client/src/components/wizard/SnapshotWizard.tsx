import { useState, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { t } from '../../lib/strings';
import { draftProblems, draftTotals, phaseProgress, type Phase } from '../../lib/snapshot-draft';
import { Button } from '../ui/Button';
import { Figure } from '../ui/Figure';
import { Delta } from '../ui/Delta';
import { IconCheck } from '../ui/icons';
import { EditingContext } from './WizardRow';
import { AccountsStep, ExpensesStep, IncomesStep, ReviewStep } from './WizardSteps';
import type { DraftActions } from './useDraft';

type Step = Phase | 'review';
const STEPS: Step[] = ['accounts', 'incomes', 'expenses', 'review'];

interface Props {
  actions: DraftActions;
  monthLabel: string;
  /** Month/year controls shown beside the title. */
  monthPicker: ReactNode;
  committing: boolean;
  /** False blocks saving for reasons outside the draft (e.g. the month already exists). */
  canCommit: boolean;
  onCommit: () => void;
}

// The end-of-month wizard: Tilit → Tulot → Menot → Yhteenveto, one phase per
// screen, with a running-totals panel. Steps can be visited in any order.
export function SnapshotWizard({ actions, monthLabel, monthPicker, committing, canCommit, onCommit }: Props) {
  const [stepIndex, setStepIndex] = useState(0);
  const [editing, setEditing] = useState<string | null>(null);
  const d = actions.draft;
  const totals = draftTotals(d);
  const step = STEPS[stepIndex];
  const blocked = !canCommit || draftProblems(d).length > 0;

  const goTo = (i: number) => {
    setEditing(null);
    setStepIndex(i);
    window.scrollTo({ top: 0 });
  };

  return (
    <EditingContext.Provider value={{ editing, setEditing }}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-base text-ink-muted">{t.newSnapshot}</p>
          <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">{monthLabel}</h1>
        </div>
        {monthPicker}
      </div>

      <ol className="mb-8 flex flex-wrap items-center gap-2">
        {STEPS.map((s, i) => {
          const p = s === 'review' ? null : phaseProgress(d, s);
          const complete = p !== null && p.filled === p.total;
          return (
            <li key={s} className="flex items-center gap-2">
              <button
                onClick={() => goTo(i)}
                aria-current={i === stepIndex ? 'step' : undefined}
                className={cn(
                  'flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                  i === stepIndex ? 'border-accent bg-accent-wash text-accent-ink' : 'border-rule bg-sheet text-ink-muted hover:text-ink'
                )}
              >
                <span
                  className={cn(
                    'flex h-6 w-6 items-center justify-center rounded-full text-xs',
                    complete ? 'bg-gain text-onFill' : i === stepIndex ? 'bg-accent text-onFill' : 'bg-neutralWash'
                  )}
                >
                  {complete ? <IconCheck className="h-3.5 w-3.5" /> : i + 1}
                </span>
                {t.wizardSteps[s]}
                {p && <span className="figure text-xs opacity-70">{p.filled}/{p.total}</span>}
              </button>
              {i < STEPS.length - 1 && <span className="h-px w-4 bg-rule-strong" aria-hidden="true" />}
            </li>
          );
        })}
      </ol>

      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <section className="card min-w-0 p-5 sm:p-6">
          <h2 className="text-xl font-semibold text-ink">{t.wizardSteps[step]}</h2>
          <p className="mb-5 text-base text-ink-muted">{t.wizardHints[step]}</p>

          {step === 'accounts' && <AccountsStep actions={actions} />}
          {step === 'incomes' && <IncomesStep actions={actions} />}
          {step === 'expenses' && <ExpensesStep actions={actions} />}
          {step === 'review' && <ReviewStep actions={actions} goTo={(phase) => goTo(STEPS.indexOf(phase))} />}

          <div className="mt-8 flex items-center justify-between border-t border-rule pt-5">
            <Button variant="ghost" disabled={stepIndex === 0} onClick={() => goTo(stepIndex - 1)}>
              {t.wizardBack}
            </Button>
            {step !== 'review' ? (
              <Button onClick={() => goTo(stepIndex + 1)}>{t.wizardNext(t.wizardSteps[STEPS[stepIndex + 1]])}</Button>
            ) : (
              <Button onClick={onCommit} disabled={blocked || committing}>
                {committing ? t.creatingSnapshot : t.createSnapshot}
              </Button>
            )}
          </div>
        </section>

        <aside className="card h-fit space-y-4 p-5 lg:sticky lg:top-24">
          <h3 className="text-sm font-medium text-ink-muted">{t.wizardMonthSoFar}</h3>
          <Stat label={t.netWorth} cents={totals.netWorth} delta={totals.netWorthDelta} />
          <Stat label={t.income} cents={totals.income} />
          <Stat label={t.expenses} cents={totals.expenses} />
          <Stat
            label={totals.surplus >= 0 ? t.surplus : t.deficit}
            cents={Math.abs(totals.surplus)}
            tone={totals.surplus >= 0 ? 'text-gain' : 'text-loss'}
          />
          <div>
            <div className="mb-1 flex justify-between text-sm text-ink-muted">
              <span>{t.wizardFilled}</span>
              <span className="figure">{totals.filled}/{totals.total}</span>
            </div>
            <div className="h-1.5 rounded-full bg-track">
              <div className="h-full rounded-full bg-accent" style={{ width: `${(totals.filled / Math.max(1, totals.total)) * 100}%` }} />
            </div>
          </div>
        </aside>
      </div>
    </EditingContext.Provider>
  );
}

function Stat({ label, cents, delta, tone }: { label: string; cents: number; delta?: number | null; tone?: string }) {
  return (
    <div>
      <div className="text-sm text-ink-muted">{label}</div>
      <Figure cents={cents} className={cn('text-xl font-semibold', tone)} />
      {delta != null && <Delta absolute={delta} className="ml-2" />}
    </div>
  );
}
