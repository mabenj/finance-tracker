import { computeNetWorthDelta, sumNetWorth } from '../../lib/net-worth';
import { computeMonthlyFigures, type Amounted } from '../../lib/monthly-figures';
import { formatEurCents } from '../../lib/currency';
import { t } from '../../lib/strings';
import { Figure } from '../ui/Figure';
import { Delta } from '../ui/Delta';

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
  const monthlyFigures = [
    { label: t.income, cents: totalIncome },
    { label: t.expenses, cents: totalExpenses },
    { label: residual.kind === 'surplus' ? t.surplus : t.deficit, cents: residual.amount },
  ];

  return (
    <div className="card p-5 sm:p-6">
      {/* Hero: the closing figure of the statement, sealed by the accountant's double rule */}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 rule-grand-bottom pb-5">
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-muted">
            {t.netWorth}
          </p>
          <Figure cents={netWorth} className="text-3xl font-semibold sm:text-4xl" />
        </div>
        <div className="text-right">
          {delta !== null && prevNetWorth !== null ? (
            <>
              <Delta absolute={delta.absolute} percentage={delta.percentage} size="lg" />
              <p className="mt-1 text-sm text-ink-muted">
                {t.vs} <span className="figure">{formatEurCents(prevNetWorth)}</span>
              </p>
            </>
          ) : (
            <p className="text-sm italic text-ink-muted">{t.noPreviousSnapshot}</p>
          )}
        </div>
      </div>

      {/* The month's cash flow: income, expenses, and the surplus or deficit */}
      <dl className="grid gap-x-6 gap-y-2 pt-5 sm:grid-cols-3">
        {monthlyFigures.map(({ label, cents }) => (
          <div key={label} className="flex items-baseline justify-between gap-3 sm:block">
            <dt className="text-xs font-medium uppercase tracking-wide text-ink-muted sm:mb-1">
              {label}
            </dt>
            <dd>
              <Figure cents={cents} className="text-base font-medium sm:text-lg" />
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
