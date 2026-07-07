import { describe, test, expect } from 'bun:test';
import { buildSankeyGraph } from './sankey-builder';
import { layoutSankey, MIN_HEIGHT, SLOT_PX } from './sankey-layout';

const salary = { id: 1, name: 'Salary', amount: 300000 };
const bonus = { id: 2, name: 'Bonus', amount: 200000 };
const catFood = { id: 1, parent_id: null, name: 'Food' };
const catTransport = { id: 2, parent_id: null, name: 'Transport' };

const normalGraph = () =>
  buildSankeyGraph(
    [salary, bonus],
    [
      { id: 1, category_id: 1, name: 'Groceries', amount: 100000 },
      { id: 2, category_id: 1, name: 'Restaurant', amount: 50000 },
      { id: 3, category_id: 2, name: 'Gas', amount: 80000 },
    ],
    [catFood, catTransport]
  );

describe('layoutSankey', () => {
  test('no-crossing guard: vertical order of each column matches DFS rank', () => {
    const { nodes } = layoutSankey(normalGraph());

    // Group positioned nodes by column (x0), then assert within-column vertical
    // order (y0 ascending) equals the builder's DFS rank order.
    const byColumn = new Map<number, typeof nodes>();
    for (const n of nodes) {
      const key = Math.round(n.x0);
      (byColumn.get(key) ?? byColumn.set(key, []).get(key)!).push(n);
    }
    for (const col of byColumn.values()) {
      const byY = [...col].sort((a, b) => a.y0 - b.y0).map((n) => n.id);
      const byRank = [...col].sort((a, b) => a.rank - b.rank).map((n) => n.id);
      expect(byY).toEqual(byRank);
    }
  });

  test('ragged edge: expenses sit at their natural depth, NOT all in one terminal column', () => {
    // "Bus" attaches directly to a top category (shallow, depth 3); "Bill" nests two
    // levels deeper under Housing → Utilities (depth 4). With sankeyLeft they land in
    // DIFFERENT columns — the shallow one to the left of the deep one (short ribbons).
    const cats = [
      { id: 2, parent_id: null, name: 'Transport' },
      { id: 10, parent_id: null, name: 'Housing' },
      { id: 11, parent_id: 10, name: 'Utilities' },
    ];
    const expenses = [
      { id: 1, category_id: 2, name: 'Bus', amount: 5000 }, // shallow: Transport → Bus
      { id: 2, category_id: 11, name: 'Bill', amount: 30000 }, // deep: Housing → Utilities → Bill
    ];
    const { nodes } = layoutSankey(
      buildSankeyGraph([{ id: 1, name: 'Salary', amount: 100000 }], expenses, cats)
    );

    const bus = nodes.find((n) => n.name === 'Bus')!;
    const bill = nodes.find((n) => n.name === 'Bill')!;
    // Shallow expense is left of the deeply-nested one — ragged right edge.
    expect(Math.round(bus.x0)).toBeLessThan(Math.round(bill.x0));
    // Each expense is one hop right of its parent category.
    const transport = nodes.find((n) => n.id === 'cat-2')!;
    const utilities = nodes.find((n) => n.id === 'cat-11')!;
    expect(Math.round(bus.x0)).toBeGreaterThan(Math.round(transport.x0));
    expect(Math.round(bill.x0)).toBeGreaterThan(Math.round(utilities.x0));
  });

  test('node thickness is value-proportional (bigger value → taller box)', () => {
    const { nodes } = layoutSankey(normalGraph());
    const groceries = nodes.find((n) => n.name === 'Groceries')!; // 100000
    const restaurant = nodes.find((n) => n.name === 'Restaurant')!; // 50000
    const hG = groceries.y1 - groceries.y0;
    const hR = restaurant.y1 - restaurant.y0;
    expect(hG).toBeGreaterThan(hR);
  });

  test('height is sized to the densest column, not the total sink count', () => {
    const small = layoutSankey(buildSankeyGraph([salary], [], [])); // 1 node per column
    expect(small.height).toBe(MIN_HEIGHT);

    // catA: 15 flat expenses (all depth 4). catB → subB: 15 expenses (all depth 5).
    // Densest column = depth 4 (15 catA expenses + subB = 16), well under the 30 total sinks.
    const cats = [
      { id: 1, parent_id: null, name: 'A' },
      { id: 2, parent_id: null, name: 'B' },
      { id: 3, parent_id: 2, name: 'Bsub' },
    ];
    const expenses = [
      ...Array.from({ length: 15 }, (_, i) => ({ id: i + 1, category_id: 1, name: `A${i}`, amount: 1000 + i })),
      ...Array.from({ length: 15 }, (_, i) => ({ id: 100 + i, category_id: 3, name: `B${i}`, amount: 1000 + i })),
    ];
    const big = layoutSankey(buildSankeyGraph([salary], expenses, cats));
    const totalSinks = 31; // 30 expenses + Surplus
    const densest = 16; // depth-4 column
    expect(big.height).toBeGreaterThan(MIN_HEIGHT);
    expect(big.height).toBe(densest * SLOT_PX + 32); // PAD_TOP + PAD_BOTTOM = 32
    expect(big.height).toBeLessThan(totalSinks * SLOT_PX); // proves it's NOT sink-count-based
  });

  test('width grows with tree depth (more horizontal room for deeper trees)', () => {
    const flat = layoutSankey(normalGraph()); // max depth 3
    const deep = layoutSankey(
      buildSankeyGraph(
        [salary],
        [{ id: 1, category_id: 11, name: 'Bill', amount: 30000 }],
        [
          { id: 10, parent_id: null, name: 'Housing' },
          { id: 11, parent_id: 10, name: 'Utilities' },
        ]
      )
    ); // max depth 4 (budget→Housing→Utilities→Bill)
    expect(deep.width).toBeGreaterThan(flat.width);
  });

  test('Budget sits left of Expenses, which sits left of categories and their expenses', () => {
    const { nodes } = layoutSankey(normalGraph());
    const budget = nodes.find((n) => n.id === 'budget')!;
    const expensesTotal = nodes.find((n) => n.id === 'expenses')!;
    const surplus = nodes.find((n) => n.id === 'surplus')!;
    const food = nodes.find((n) => n.id === 'cat-1')!;
    const groceries = nodes.find((n) => n.id === 'exp-1')!;
    const income = nodes.find((n) => n.id === 'income-1')!;
    expect(income.x0).toBeLessThan(budget.x0);
    expect(budget.x0).toBeLessThan(expensesTotal.x0);
    expect(expensesTotal.x0).toBeLessThan(food.x0);
    expect(food.x0).toBeLessThan(groceries.x0);
    // Siblings: Expenses and Surplus share a column, Surplus below.
    expect(Math.round(surplus.x0)).toBe(Math.round(expensesTotal.x0));
    expect(surplus.y0).toBeGreaterThan(expensesTotal.y0);
  });
});
