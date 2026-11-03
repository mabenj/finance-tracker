import { computeNetWorthDelta, sumNetWorth } from '../../lib/net-worth';
import { computeMonthlyFigures, type Amounted } from '../../lib/monthly-figures';
import { formatEurCents } from '../../lib/currency';
import { t } from '../../lib/strings';
import { cn } from '../../lib/cn';
import { Figure } from '../ui/Figure';
import { Badge } from '../ui/Badge';

interface Account {
  name: string;
  type: string;
  balance: number;
}

interface Props {
  accounts: Account[];
  previousAccounts: Account[] | null;
  incomes: Amounted[];
  expenses: Amounted[];
}

export function NetWorthComparison({ accounts, previousAccounts, incomes, expenses }: Props) {
  const netWorth = sumNetWorth(accounts);
  const prevNetWorth = previousAccounts !== null ? sumNetWorth(previousAccounts) : null;

  const delta = prevNetWorth !== null ? computeNetWorthDelta(netWorth, prevNetWorth) : null;

  // Plain figures with no month-over-month comparison: a half-entered month
  // (variable items still at €0) would otherwise show misleading drops.
  const { totalIncome, totalExpenses, residual } = computeMonthlyFigures(incomes, expenses);
  const surplus = residual.kind === 'surplus';

  const cards: { label: string; value: React.ReactNode; footer?: React.ReactNode }[] = [
    {
      label: t.netWorth,
      value: <Figure cents={netWorth} />,
      footer:
        delta !== null && prevNetWorth !== null ? (
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={delta.absolute >= 0 ? 'gain' : 'loss'}>
              {delta.absolute >= 0 ? '+' : '−'}
              {formatEurCents(Math.abs(delta.absolute))}
            </Badge>
            <span className="text-sm text-ink-muted">
              {t.vs} <span className="figure">{formatEurCents(prevNetWorth)}</span>
            </span>
          </div>
        ) : (
          <span className="text-sm text-ink-muted">{t.noPreviousSnapshot}</span>
        ),
    },
    { label: t.income, value: <Figure cents={totalIncome} /> },
    { label: t.expenses, value: <Figure cents={totalExpenses} /> },
    {
      label: surplus ? t.surplus : t.deficit,
      value: <span className={cn('figure', surplus ? 'text-gain' : 'text-loss')}>{formatEurCents(residual.amount)}</span>,
    },
  ];

  return (
    <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((c) => (
        <div key={c.label} className="card p-5">
          <dt className="text-sm font-medium text-ink-muted">{c.label}</dt>
          <dd className="mt-2 text-2xl font-semibold">{c.value}</dd>
          {c.footer && <dd className="mt-3">{c.footer}</dd>}
        </div>
      ))}
    </dl>
  );
}
