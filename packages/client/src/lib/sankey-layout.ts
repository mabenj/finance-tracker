import { sankey as d3Sankey, sankeyLeft } from 'd3-sankey';
import type { SankeyGraph, SankeyNode } from './sankey-builder';

export const MIN_HEIGHT = 320;
// Vertical room reserved per node in the densest column so it stays uncrammed.
export const SLOT_PX = 34;
// Horizontal room per column hop — the primary lever for ribbon steepness/clipping.
export const COL_HOP = 240;
// The shortest hop used to fit a narrow container; below it the diagram scrolls instead.
export const MIN_COL_HOP = 150;

const NODE_WIDTH = 16;
// Guaranteed (never-compressed) gap between stacked nodes. Kept >= a label line so
// even 1px-tall slivers have room for their label without colliding with neighbours.
const NODE_PADDING = 16;
const PAD_TOP = 16;
const PAD_BOTTOM = 16;
// Every label sits right of its node, so only the right edge needs room for labels.
const PAD_LEFT = 8;
const PAD_RIGHT = 170;

export interface PositionedNode extends SankeyNode {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export interface PositionedLink {
  source: PositionedNode;
  target: PositionedNode;
  value: number;
  color: string;
  width: number;
  y0: number;
  y1: number;
}

export interface SankeyLayout {
  nodes: PositionedNode[];
  links: PositionedLink[];
  width: number;
  height: number;
}

/**
 * Position the graph with d3-sankey's proportional geometry, but force OUR ordering:
 * - `nodeSort` by the builder's DFS rank → every subtree is one contiguous band, no crossings.
 * - `sankeyLeft` → each node sits at its natural tree depth (ragged right edge), so expense
 *   ribbons are short, single-column hops instead of long cross-column sweeps.
 * Width grows with tree depth (real horizontal pixels → gentler ribbons), shortening the hops
 * to fit `maxWidth` when given; height is sized to the densest column so expenses spread
 * across columns without cramming.
 */
export function layoutSankey(graph: SankeyGraph, maxWidth = Infinity): SankeyLayout {
  // Column geometry is driven by the builder's `depth` (matches sankeyLeft's columns).
  let maxDepth = 0;
  const perColumn = new Map<number, number>();
  for (const n of graph.nodes) {
    maxDepth = Math.max(maxDepth, n.depth);
    perColumn.set(n.depth, (perColumn.get(n.depth) ?? 0) + 1);
  }
  const maxColumnNodeCount = Math.max(1, ...perColumn.values());

  const hops = Math.max(3, maxDepth);
  const fittedHop = Math.floor((maxWidth - PAD_LEFT - PAD_RIGHT - NODE_WIDTH) / hops);
  const colHop = Math.max(MIN_COL_HOP, Math.min(COL_HOP, fittedHop));
  // d3-sankey spaces columns over the extent minus one node width, so add it back.
  const width = PAD_LEFT + PAD_RIGHT + NODE_WIDTH + hops * colHop;
  const height = Math.max(MIN_HEIGHT, maxColumnNodeCount * SLOT_PX + PAD_TOP + PAD_BOTTOM);

  const layout = d3Sankey<SankeyNode, { value: number; color: string }>()
    .nodeId((d) => d.id)
    .nodeWidth(NODE_WIDTH)
    .nodePadding(NODE_PADDING)
    .nodeAlign(sankeyLeft)
    .nodeSort((a, b) => (a as SankeyNode).rank - (b as SankeyNode).rank)
    .extent([
      [PAD_LEFT, PAD_TOP],
      [width - PAD_RIGHT, height - PAD_BOTTOM],
    ]);

  const result = layout({
    nodes: graph.nodes.map((n) => ({ ...n })),
    links: graph.links.map((l) => ({ ...l })) as any,
  });

  return {
    nodes: result.nodes as unknown as PositionedNode[],
    links: result.links as unknown as PositionedLink[],
    width,
    height,
  };
}
