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
import { formatEurCents, formatDeltaCents } from '../../lib/currency';

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

  const delta =
    prevNetWorth !== null ? computeNetWorthDelta(netWorth, prevNetWorth) : null;

  const chartData = buildAccountChartData(accounts, previousAccounts);

  const formatAxis = (v: number) =>
    new Intl.NumberFormat('fi-FI', {
      style: 'currency',
      currency: 'EUR',
      notation: 'compact',
      maximumFractionDigits: 0,
    }).format(v / 100);

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6">
      {/* Headline */}
      <div className="flex flex-wrap items-baseline gap-4 mb-6">
        <div>
          <p className="text-sm text-gray-500 mb-0.5">Net Worth</p>
          <p className="text-3xl font-bold tabular-nums">{formatEurCents(netWorth)}</p>
        </div>
        {delta !== null && prevNetWorth !== null && (
          <div>
            <p className="text-sm text-gray-500 mb-0.5">
              vs {formatEurCents(prevNetWorth)}
            </p>
            <p
              className={`text-xl font-semibold tabular-nums ${
                delta.absolute >= 0 ? 'text-green-600' : 'text-red-600'
              }`}
            >
              {formatDeltaCents(delta.absolute)}
              {delta.percentage !== null && (
                <span className="text-base ml-2">
                  ({delta.percentage >= 0 ? '+' : ''}
                  {delta.percentage.toFixed(1)}%)
                </span>
              )}
            </p>
          </div>
        )}
        {prevNetWorth === null && (
          <p className="text-sm text-gray-400 italic">No previous snapshot</p>
        )}
      </div>

      {/* Bar chart */}
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11 }}
            interval={0}
            angle={-30}
            textAnchor="end"
            height={60}
          />
          <YAxis tickFormatter={formatAxis} tick={{ fontSize: 11 }} width={80} />
          <Tooltip
            formatter={(value: number) => formatEurCents(value)}
            labelStyle={{ fontWeight: 600 }}
          />
          <Legend />
          <ReferenceLine y={0} stroke="#9ca3af" strokeWidth={1} />
          {prevNetWorth !== null && (
            <Bar dataKey="Previous" fill="#94a3b8" radius={[2, 2, 0, 0]} />
          )}
          <Bar dataKey="Current" fill="#3b82f6" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
