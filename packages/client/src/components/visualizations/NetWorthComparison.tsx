import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';
import { computeNetWorthDelta, sumNetWorth, buildAccountChartData } from '../../lib/net-worth';
import { formatEurCents } from '../../lib/currency';
import { t } from '../../lib/strings';
import { chart } from '../../lib/theme';
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
}

export function NetWorthComparison({ accounts, previousAccounts }: Props) {
  const netWorth = sumNetWorth(accounts);
  const prevNetWorth = previousAccounts !== null ? sumNetWorth(previousAccounts) : null;

  const delta = prevNetWorth !== null ? computeNetWorthDelta(netWorth, prevNetWorth) : null;

  const chartData = buildAccountChartData(accounts, previousAccounts);

  const formatAxis = (v: number) =>
    new Intl.NumberFormat('fi-FI', {
      style: 'currency',
      currency: 'EUR',
      notation: 'compact',
      maximumFractionDigits: 0,
    }).format(v / 100);

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

      {/* Per-account comparison */}
      <div className="pt-5">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData} margin={{ top: 5, right: 12, left: 12, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 11, fill: chart.axis }}
              tickLine={{ stroke: chart.grid }}
              axisLine={{ stroke: chart.grid }}
              interval={0}
              angle={-30}
              textAnchor="end"
              height={60}
            />
            <YAxis
              tickFormatter={formatAxis}
              tick={{ fontSize: 11, fill: chart.axis }}
              tickLine={{ stroke: chart.grid }}
              axisLine={{ stroke: chart.grid }}
              width={80}
            />
            <Tooltip
              cursor={{ fill: 'rgba(38,69,122,0.06)' }}
              formatter={(value: number) => formatEurCents(value)}
              contentStyle={{
                background: 'var(--sheet)',
                border: '1px solid var(--rule)',
                borderRadius: 8,
                boxShadow: 'var(--shadow-pop)',
                fontSize: 12,
              }}
              labelStyle={{ fontWeight: 600, color: 'var(--ink)' }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <ReferenceLine y={0} stroke={chart.zero} strokeWidth={1} />
            {prevNetWorth !== null && (
              <Bar dataKey="Previous" name={t.previous} fill={chart.previous} radius={[2, 2, 0, 0]} />
            )}
            <Bar dataKey="Current" name={t.current} fill={chart.current} radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
