import { useState } from 'react';
import { createPortal } from 'react-dom';
import { sankeyLinkHorizontal } from 'd3-sankey';
import { buildSankeyGraph } from '../../lib/sankey-builder';
import { layoutSankey, type PositionedNode, type PositionedLink } from '../../lib/sankey-layout';
import { formatEurCents } from '../../lib/currency';
import { t } from '../../lib/strings';

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

const LABEL_FONT_PX = 13;

export function SankeyDiagram({ incomes, expenses, categories }: Props) {
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    label: string;
    value: number;
  } | null>(null);

  const graph = buildSankeyGraph(incomes, expenses, categories);

  if (graph.nodes.length === 0) {
    return <p className="text-base text-ink-muted">{t.sankeyNoData}</p>;
  }

  const { nodes, links, width, height } = layoutSankey(graph);

  return (
    <div className="relative w-full overflow-x-auto">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="overflow-visible block mx-auto"
      >
        {/* Links */}
        {links.map((link, i) => {
          const path = sankeyLinkHorizontal()(link as any);
          const src = link.source;
          const tgt = link.target;
          return (
            <path
              key={i}
              d={path ?? ''}
              fill="none"
              stroke={link.color}
              strokeOpacity={0.35}
              strokeWidth={Math.max(1, link.width)}
              className="transition-[stroke-opacity] hover:!stroke-opacity-60 cursor-default"
              onMouseEnter={(e) =>
                setTooltip({
                  x: e.clientX,
                  y: e.clientY,
                  label: `${src.name} → ${tgt.name}`,
                  value: link.value,
                })
              }
              onMouseLeave={() => setTooltip(null)}
            />
          );
        })}

        {/* Nodes */}
        {nodes.map((node) => {
          const n = node as PositionedNode;
          const h = Math.max(1, n.y1 - n.y0);
          const isDashed = n.type === 'deficit' || n.type === 'unspecified-income';
          // Leaf expenses always label to their right (outward); other nodes flip by side.
          const labelOnLeft = n.type === 'expense' ? false : n.x0 > width / 2;
          const cy = (n.y0 + n.y1) / 2;

          return (
            <g
              key={n.id}
              onMouseEnter={(e) =>
                setTooltip({ x: e.clientX, y: e.clientY, label: n.name, value: n.value })
              }
              onMouseLeave={() => setTooltip(null)}
              className="cursor-default"
            >
              <rect
                x={n.x0}
                y={n.y0}
                width={n.x1 - n.x0}
                height={h}
                fill={n.color}
                fillOpacity={isDashed ? 0.45 : 0.85}
                stroke={isDashed ? n.color : 'none'}
                strokeDasharray={isDashed ? '4 2' : undefined}
                rx={2}
              />
              {/* Every node is labelled — NODE_PADDING guarantees room even for slivers. */}
              <text
                x={labelOnLeft ? n.x0 - 6 : n.x1 + 6}
                y={cy}
                dy="0.35em"
                textAnchor={labelOnLeft ? 'end' : 'start'}
                fontSize={LABEL_FONT_PX}
                className="select-none [fill:var(--ink)]"
              >
                {n.name} {formatEurCents(n.value)}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Tooltip — portaled to body so the card's CSS transform doesn't offset `position: fixed`. */}
      {tooltip &&
        createPortal(
          <div
            className="fixed z-50 bg-gray-900 text-white text-sm rounded-control px-3 py-2 pointer-events-none shadow-lg"
            style={{ left: tooltip.x + 14, top: tooltip.y - 36 }}
          >
            <div className="font-medium">{tooltip.label}</div>
            <div className="text-gray-300">{formatEurCents(tooltip.value)}</div>
          </div>,
          document.body
        )}
    </div>
  );
}

// Re-exported for tests / external use.
export type { PositionedNode, PositionedLink };
