# Sankey Diagram Rewrite — Specification (as built)

**Status:** Implemented.
**Goal:** A SankeyMatic-style "where did my money go" diagram — readable at a glance, value-proportional, every subtree visually grouped so no flow lines cross, with breathing room and every node labelled.

This document describes the **shipped** design. Where the approach changed during implementation, the final decision is recorded (earlier alternatives are noted only when they explain a non-obvious choice).

---

## 1. Motivation

The original diagram had three problems: (1) stock `d3-sankey` ordering tangled the ribbons and didn't keep a parent's descendants grouped; (2) a fixed-height canvas crammed everything into illegible slivers; (3) amounts were hidden in tooltips only.

The data is a strict **tree** (one trunk, every node has exactly one parent). A tree can always be drawn with zero crossings by ordering every column via a depth-first traversal — that insight drives the whole design.

---

## 2. Topology — single-trunk model

```
Salary    ─┐
Bonus     ─┼─► [ Expenses ] ─┬─► Housing  ─► Rent
Side gig  ─┘                 │            └─► Utilities ─► Electricity
                             ├─► Food     ─► Groceries
                             │            └─► Restaurants
                             ├─► Transport ─► Bus ticket   (direct expense, shallow)
                             │             └─► Car ─► Fuel  (subcategory, deeper)
                             └─► Savings                    (pinned bottom)
```

- **One trunk node.** Income sources flow *in*; expense categories and Savings flow *out*. Its internal `id`/`type` is `budget`, but it is **labelled "Expenses"** in the UI.
- **Full depth to individual expenses.** `trunk → top category → … → leaf category → individual expense`. Individual expenses are terminal leaf nodes carrying their own name.
- **Mixed children allowed.** A category may emit flows to both subcategory nodes *and* directly-attached expense nodes (`expenses.category_id` may reference any category, not only leaves).
- **No collapsing.** Single-child chains are not collapsed — every category and every expense is its own node.

### 2.1 Node types

| Type | Count | Notes |
|---|---|---|
| `income` | 0..N | one per income row with amount > 0; neutral color |
| `unspecified-income` | 0..1 | only when there is no income (see §3) |
| `deficit` | 0..1 | only in a deficit (see §3) |
| `budget` | 1 | the trunk (labelled "Expenses"); absent only for an empty graph |
| `category` | 0..N | one per category with a non-zero subtree total |
| `expense` | 0..N | one per individual expense with amount > 0 |
| `savings` | 0..1 | only when savings > 0 |

Each node also carries a **`depth`** (income=0, trunk=1, top category=2, nested category=parent+1, expense=parentCategory+1, savings=2) used by the layout to size the canvas, and a **`rank`** (pre-order DFS index) used to order columns.

```ts
type SankeyNodeType =
  | 'income' | 'unspecified-income' | 'deficit'
  | 'budget' | 'category' | 'expense' | 'savings';
```

---

## 3. Edge states

Evaluated in this **exact priority order** (first match wins). This resolves income=0 with negative implied savings: it is handled by **No income**, which never runs deficit/savings logic.

| # | State | Condition (none above matched) | Shape |
|---|---|---|---|
| 1 | **Empty** | no income **and** no expenses | empty graph → component renders "No data" |
| 2 | **No income** | no income (some expenses) | `Unspecified Income → trunk → categories`. No Savings, no Deficit; the source equals total expenses |
| 3 | **No expenses** | income, no expenses | `income → trunk → Savings` (everything saved) |
| 4 | **Deficit** | `expenses > income` | `Deficit → trunk` alongside income; no Savings. Deficit value = expenses − income |
| 5 | **Break-even** | `expenses == income` | no Savings, no Deficit |
| 6 | **Normal** | `income > expenses` | income → trunk → categories + Savings |

Deficit and Unspecified-Income source nodes render **dashed**.

---

## 4. Layout — d3-sankey geometry steered by our ordering

We keep **d3-sankey's value-proportional geometry and ribbon relaxation**, but **override its node ordering** with our deterministic DFS `rank` (via `nodeSort`) and use **`sankeyLeft`** alignment. d3's tangle came from *its* ordering, which we replace; its proportional geometry was never the problem. (An earlier draft used `sankeyJustify` to force a single terminal column; that was dropped — see §4.3.)

### 4.0 Definition of "value"

A node's **value** is its **subtree total** via `sumTree` (`src/lib/sum-tree.ts`): expense = its amount; category = sum of descendant expenses. Drives both the sort key (§4.1) and node/ribbon thickness. d3-sankey derives each node value as the sum of its links, which equals this.

### 4.1 Ordering — guarantees zero crossings

The **builder** assigns every node a global **pre-order DFS `rank`**:

1. DFS from the trunk, fixing child order at each node.
2. **Children sorted value-descending** at every level. Subcategories and directly-attached expenses are interleaved in one value-sorted list (mixed children).
3. **Tie-break:** equal-value siblings by **name ascending (locale-aware), then `id` ascending** — fully deterministic (the no-crossing guard test depends on it).
4. **Savings pinned bottom** of trunk outflows (visited last → highest rank); **Deficit pinned bottom** of income sources.
5. Income sources ranked first (value-desc), then the trunk, then the expense subtree in DFS order.

The **layout** passes `nodeSort: (a, b) => a.rank - b.rank` to d3-sankey. Because a subtree's ranks are contiguous, each subtree occupies one **contiguous vertical band** per column → no flow ever crosses. This is the invariant the rewrite rests on.

### 4.2 Vertical geometry — value-proportional, sized to the densest column

- **Node and ribbon thickness are proportional to value** (d3-sankey default). Big spend = fat ribbon.
- **Height is sized to the densest column**, not the total sink count: `height = max(MIN_HEIGHT, maxColumnNodeCount × SLOT_PX + PAD_TOP + PAD_BOTTOM)`, where `maxColumnNodeCount` is the largest count of nodes sharing a `depth`. Because the ragged edge (§4.3) spreads expenses across columns by nesting depth, this is often shorter than sizing by total sinks.
- **`NODE_PADDING` is a guaranteed (never-compressed) gap** between stacked nodes, kept ≥ a label line so even 1px-tall slivers get a non-overlapping label.

### 4.3 Horizontal geometry — `sankeyLeft` (ragged edge) + real width

- **`nodeAlign = sankeyLeft`**: every node sits at its natural tree depth. An expense attached to a shallow category sits one hop right of it; a deeply-nested expense sits further right. The right edge is **ragged** (no single terminal column). This eliminates the long cross-column "sweeps" that were the worst source of ribbon overlap, and spreads expenses across columns (relieving vertical density too).
- **Width grows with depth for real horizontal pixels:** `width = PAD_LEFT + PAD_RIGHT + max(3, maxDepth) × COL_HOP`. More horizontal distance per column = gentler ribbon slopes = less clipping. Crucially this is *rendered at explicit pixel width* (§7), not scaled-to-fit — a wider `viewBox` under `w-full` would just rescale and change nothing.

### 4.4 Layout constants (`sankey-layout.ts`)

| Constant | Value | Purpose |
|---|---|---|
| `COL_HOP` | **240** | horizontal pixels per column hop — primary lever for ribbon steepness/clipping |
| `SLOT_PX` | **34** | vertical room reserved per node in the densest column |
| `MIN_HEIGHT` | **320** | floor for total SVG height |
| `NODE_PADDING` | **16** | guaranteed vertical gap between stacked nodes (≥ a label line) |
| `NODE_WIDTH` | **16** | rectangle width |
| `PAD_TOP` / `PAD_BOTTOM` | **16 / 16** | vertical insets of the drawing extent |
| `PAD_LEFT` / `PAD_RIGHT` | **110 / 170** | horizontal insets reserving label room |
| `LABEL_FONT_PX` | **11** | label font size (in the component) |

`width` and `height` are both computed per-graph and returned by `layoutSankey`.

---

## 5. Labels

- **Every node is labelled** (no suppression — the guaranteed `NODE_PADDING` gap makes room even for slivers). Format: **`Name <amount>`**, e.g. `Groceries 420 €`. **No percentage.**
- **Amounts** use `formatEurCents` (locale `fi-FI`), whole euros only → trailing euro sign, NBSP thousands separator (`1 240 €`).
- **Label side:** **leaf expense** nodes always label to their **right** (outward); all other nodes flip by position (label on the left when `x0 > width / 2`, else right).
- **No text halo** — plain dark fill (`#1f2937`).
- **Tooltip** (`Name` + amount) on hover, **portaled to `document.body`** so the card's CSS `transform` (§7) doesn't offset its `position: fixed`.

---

## 6. Color

- **Each top-level category gets a hue** from a fixed 8-hue palette, by DFS order among top categories; cycles `% 8` past 8 categories:
  `['#3b82f6','#8b5cf6','#ec4899','#f97316','#14b8a6','#eab308','#06b6d4','#a855f7']`
- The hue **propagates down the whole subtree** (descendant categories, expenses, and their links).
- **Fixed-role colors:** income + trunk neutral `#64748b`; `unspecified-income` amber `#f59e0b`; `savings` green `#22c55e`; `deficit` red `#ef4444`.
- **Link color = the non-trunk endpoint's color:** `link.color = (target is trunk) ? source.color : target.color`. Rendered at `strokeOpacity` 0.35; node rects at `fillOpacity` 0.85 (dashed sources 0.45).

---

## 7. Code structure & rendering

| File | Responsibility |
|---|---|
| `packages/client/src/lib/sankey-builder.ts` | Build the graph: nodes (with `value`, `depth`, `color`, DFS `rank`) and colored links. Pure, unit-tested. |
| `packages/client/src/lib/sankey-layout.ts` | Thin `d3-sankey` wrapper: derived width, densest-column height, `nodeSort` by rank, `sankeyLeft`. Returns positioned nodes/links + `width`/`height`. Unit-tested. |
| `packages/client/src/components/visualizations/SankeyDiagram.tsx` | Renderer: build → layout → rects + `sankeyLinkHorizontal` ribbons + labels + portaled tooltip. |
| `packages/client/src/components/snapshot/SnapshotDetail.tsx` | Hosts the Sankey card. |

**Rendering / sizing (the "real horizontal room" mechanism):**
- The SVG is rendered at **explicit pixel** `width`/`height` (1:1 with its `viewBox`), inside a `div.overflow-x-auto` wrapper — so the diagram gets genuine horizontal pixels and scrolls horizontally on narrow screens instead of being rescaled to fit.
- The **Sankey card breaks out** of the page's `max-w-5xl` column to `w-[min(96rem,calc(100vw-2rem))]` centered via `relative left-1/2 -translate-x-1/2`, so it uses far more screen width (no scroll on a ~1500px+ monitor). The `-translate-x-1/2` transform is why the tooltip must be portaled (§5).

Reused utilities: `sumTree` (subtree totals), `formatEurCents` (whole-euro `fi-FI` formatting).

---

## 8. Tests

`sankey-builder.test.ts` + `sankey-layout.test.ts`.

**Builder:** all six edge states (priority order; no-income → neither savings nor deficit); Savings pinned last among outflows / Deficit last among inflows; value-desc sort with name/id tie-break; DFS leaf order; value conservation (Σ inflows == Σ outflows); mixed children; zero-value exclusion; `depth` assignment per tree level; palette hue propagates down subtree.

**Layout:**
- **No-crossing guard:** within each column (grouped by `x0`), vertical order (`y0` asc) == DFS `rank` order.
- **Ragged edge:** a shallow-category expense has a smaller `x0` than a deeply-nested one; each expense is one hop right of its parent category.
- **Value-proportional:** larger value → taller node.
- **Height sized to densest column** (not total sinks); floors at `MIN_HEIGHT`.
- **Width grows with tree depth.**
- **Column progression:** income < trunk < category < its expenses.

---

## 9. Accepted trade-offs

- **Ragged right edge** (no single "where it ended up" column) — chosen over `sankeyJustify` because the long cross-column sweeps it produced were the main ribbon-clipping culprit.
- **Tiny flows are thin slivers** — inherent to value-proportional sizing. They are still labelled (the guaranteed gap makes room), so magnitude is readable from the label even when the ribbon is hair-thin.
- **Palette cycles past 8 top categories.**
- **No top-N / "Other" bucketing** and **no single-child collapsing** — full detail is always shown; the canvas grows instead.
- **Horizontal scroll on narrow screens** (the card breaks out wide; small viewports scroll).

---

## 10. Zero-value handling

- Zero-amount incomes and zero-amount expenses are dropped (no node, no link).
- Categories with a zero subtree total are excluded.
- No zero-value links are ever emitted (keeps value-conservation exact).
- "No expenses" means no expense with amount > 0; a snapshot of only zero-amount expenses is **No expenses** (and, with no income, **Empty**).
