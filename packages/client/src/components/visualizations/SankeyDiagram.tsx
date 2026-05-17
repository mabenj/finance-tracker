import { useState } from 'react';
import { sankey as d3Sankey, sankeyLinkHorizontal, SankeyGraph as D3SankeyGraph } from 'd3-sankey';
import { buildSankeyGraph } from '../../lib/sankey-builder';
import { formatEurCents } from '../../lib/currency';

interface Income {
  id: number;
  name: string;
  amount: number;
}

interface Expense {
  id: number;
  name: string;
  amount: number;
  category_id: number;
}

interface Category {
  id: number;
  name: string;
  parent_id: number | null;
}

interface Props {
  incomes: Income[];
  expenses: Expense[];
  categories: Category[];
}

interface NodeExtra {
  id: string;
  label: string;
  type: string;
}

interface LinkExtra {
  value: number;
}

const NODE_COLOR: Record<string, string> = {
  income: '#3b82f6',
  expenses: '#8b5cf6',
  savings: '#22c55e',
  category: '#64748b',
  'unspecified-income': '#f59e0b',
  deficit: '#ef4444',
};

const WIDTH = 960;
const HEIGHT = 520;

export function SankeyDiagram({ incomes, expenses, categories }: Props) {
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    label: string;
    value: number;
    pct: number;
  } | null>(null);

  const graph = buildSankeyGraph(incomes, expenses, categories);

  if (graph.nodes.length === 0) {
    return <p className="text-sm text-gray-400 italic">No data to display in Sankey.</p>;
  }

  // Use the larger of total income or total expenses as the percentage base so
  // that tooltip percentages never exceed 100% (e.g. in deficit scenarios the
  // Expenses aggregate node value equals totalExpenses, not totalIncome).
  const totalIncome = incomes.reduce((s, i) => s + i.amount, 0);
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const totalFlow = Math.max(totalIncome, totalExpenses) || 1;

  const sankeyLayout = d3Sankey<NodeExtra, LinkExtra>()
    .nodeId((d) => d.id)
    .nodeWidth(16)
    .nodePadding(12)
    .extent([
      [20, 20],
      [WIDTH - 20, HEIGHT - 20],
    ]);

  const { nodes: layoutNodes, links: layoutLinks } = sankeyLayout({
    nodes: graph.nodes.map((n) => ({ ...n })),
    links: graph.links.map((l) => ({ ...l })) as any,
  } as D3SankeyGraph<NodeExtra, LinkExtra>);

  return (
    <div className="relative w-full">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full overflow-visible"
        style={{ minHeight: 320 }}
      >
        {/* Links */}
        {layoutLinks.map((link, i) => {
          const path = sankeyLinkHorizontal()(link as any);
          const val = link.value;
          const pct = totalFlow > 0 ? (val / totalFlow) * 100 : 0;
          const src = link.source as any;
          const tgt = link.target as any;
          return (
            <path
              key={i}
              d={path ?? ''}
              fill="none"
              stroke="#94a3b8"
              strokeOpacity={0.35}
              strokeWidth={Math.max(1, (link as any).width ?? 1)}
              className="transition-[stroke-opacity] hover:stroke-opacity-60 cursor-default"
              onMouseEnter={(e) =>
                setTooltip({
                  x: e.clientX,
                  y: e.clientY,
                  label: `${src.label} → ${tgt.label}`,
                  value: val,
                  pct,
                })
              }
              onMouseLeave={() => setTooltip(null)}
            />
          );
        })}

        {/* Nodes */}
        {layoutNodes.map((node) => {
          const n = node as any;
          const x0 = n.x0 ?? 0;
          const x1 = n.x1 ?? 0;
          const y0 = n.y0 ?? 0;
          const y1 = n.y1 ?? 0;
          const h = Math.max(1, y1 - y0);
          const color = NODE_COLOR[n.type] ?? '#94a3b8';
          const isDashed = n.type === 'deficit' || n.type === 'unspecified-income';
          const labelOnLeft = x0 > WIDTH / 2;
          const val = n.value ?? 0;
          const pct = totalFlow > 0 ? (val / totalFlow) * 100 : 0;

          return (
            <g
              key={n.id}
              onMouseEnter={(e) =>
                setTooltip({ x: e.clientX, y: e.clientY, label: n.label, value: val, pct })
              }
              onMouseLeave={() => setTooltip(null)}
              className="cursor-default"
            >
              <rect
                x={x0}
                y={y0}
                width={x1 - x0}
                height={h}
                fill={color}
                fillOpacity={isDashed ? 0.45 : 0.85}
                stroke={isDashed ? color : 'none'}
                strokeDasharray={isDashed ? '4 2' : undefined}
                rx={2}
              />
              {h > 8 && (
                <text
                  x={labelOnLeft ? x0 - 6 : x1 + 6}
                  y={(y0 + y1) / 2}
                  dy="0.35em"
                  textAnchor={labelOnLeft ? 'end' : 'start'}
                  fontSize={11}
                  fill="#374151"
                  className="select-none"
                >
                  {n.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 bg-gray-900 text-white text-xs rounded px-2 py-1 pointer-events-none shadow-lg"
          style={{ left: tooltip.x + 14, top: tooltip.y - 36 }}
        >
          <div className="font-medium">{tooltip.label}</div>
          <div className="text-gray-300">
            {formatEurCents(tooltip.value)}{' '}
            <span className="text-gray-400">({tooltip.pct.toFixed(1)}%)</span>
          </div>
        </div>
      )}
    </div>
  );
}
