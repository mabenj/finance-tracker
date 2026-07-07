import { describe, test, expect } from 'bun:test';
import { buildSankeyGraph } from './sankey-builder';

const salary = { id: 1, name: 'Salary', amount: 300000 };
const bonus = { id: 2, name: 'Bonus', amount: 200000 };

const catFood = { id: 1, parent_id: null, name: 'Food' };
const catTransport = { id: 2, parent_id: null, name: 'Transport' };

// ids 10/11/12 avoid collisions with catFood(1)/catTransport(2).
const catHousing = { id: 10, parent_id: null, name: 'Housing' };
const catUtilities = { id: 11, parent_id: 10, name: 'Utilities' };
const catElectricity = { id: 12, parent_id: 11, name: 'Electricity' };

const byId = (g: ReturnType<typeof buildSankeyGraph>, id: string) =>
  g.nodes.find((n) => n.id === id);

describe('buildSankeyGraph — topology', () => {
  test('normal case: income → Budget → { Expenses → categories, Surplus }', () => {
    const incomes = [salary, bonus]; // 500000
    const categories = [catFood, catTransport];
    const expenses = [
      { id: 1, category_id: 1, name: 'Groceries', amount: 100000 },
      { id: 2, category_id: 1, name: 'Restaurant', amount: 50000 },
      { id: 3, category_id: 2, name: 'Gas', amount: 80000 },
    ]; // 230000, surplus 270000

    const g = buildSankeyGraph(incomes, expenses, categories);

    expect(byId(g, 'budget')).toBeDefined();
    expect(byId(g, 'expenses')).toBeDefined();
    expect(byId(g, 'surplus')).toBeDefined();
    expect(byId(g, 'deficit')).toBeUndefined();
    expect(byId(g, 'unspecified')).toBeUndefined();

    // Expenses and Surplus are siblings: both flow out of the Budget trunk.
    expect(g.links.find((l) => l.source === 'budget' && l.target === 'expenses')).toBeDefined();
    expect(g.links.find((l) => l.source === 'budget' && l.target === 'surplus')).toBeDefined();

    // income → budget (x2), budget → Expenses, budget → Surplus,
    // Expenses → Food, Expenses → Transport, Food → Groceries, Food → Restaurant, Transport → Gas
    expect(g.links).toHaveLength(9);
    expect(g.links.every((l) => l.value > 0)).toBe(true);

    expect(byId(g, 'expenses')!.value).toBe(230000);
    const surplusLink = g.links.find((l) => l.target === 'surplus');
    expect(surplusLink!.value).toBe(270000);
  });

  test('value conservation: Σ Budget inflows == Σ Budget outflows', () => {
    const g = buildSankeyGraph(
      [salary, bonus],
      [
        { id: 1, category_id: 1, name: 'Groceries', amount: 100000 },
        { id: 3, category_id: 2, name: 'Gas', amount: 80000 },
      ],
      [catFood, catTransport]
    );
    const inflow = g.links.filter((l) => l.target === 'budget').reduce((s, l) => s + l.value, 0);
    const outflow = g.links.filter((l) => l.source === 'budget').reduce((s, l) => s + l.value, 0);
    expect(inflow).toBe(outflow);
    expect(inflow).toBe(500000);
  });

  test('Surplus is pinned last (highest rank) among Budget outflows', () => {
    const g = buildSankeyGraph(
      [salary, bonus],
      [{ id: 1, category_id: 1, name: 'Groceries', amount: 100000 }],
      [catFood, catTransport]
    );
    const surplus = byId(g, 'surplus')!;
    const outflowTargets = g.links
      .filter((l) => l.source === 'budget')
      .map((l) => byId(g, l.target)!);
    const maxNonSurplusRank = Math.max(
      ...outflowTargets.filter((n) => n.type !== 'surplus').map((n) => n.rank)
    );
    expect(surplus.rank).toBeGreaterThan(maxNonSurplusRank);
  });

  test('no expenses: income → Budget → Surplus, no Expenses node, no category nodes', () => {
    const g = buildSankeyGraph([salary, bonus], [], []);
    expect(byId(g, 'budget')).toBeDefined();
    expect(byId(g, 'surplus')).toBeDefined();
    expect(byId(g, 'expenses')).toBeUndefined();
    expect(g.nodes.some((n) => n.type === 'category')).toBe(false);
    const surplusFlow = g.links
      .filter((l) => l.target === 'surplus')
      .reduce((s, l) => s + l.value, 0);
    expect(surplusFlow).toBe(500000);
  });

  test('no income: Unspecified Income → Budget → Expenses → categories, no Surplus, no Deficit', () => {
    const g = buildSankeyGraph(
      [],
      [{ id: 1, category_id: 1, name: 'Groceries', amount: 100000 }],
      [catFood]
    );
    const unspecified = g.nodes.filter((n) => n.type === 'unspecified-income');
    expect(unspecified).toHaveLength(1);
    expect(unspecified[0].value).toBe(100000);
    expect(byId(g, 'surplus')).toBeUndefined();
    expect(g.nodes.some((n) => n.type === 'deficit')).toBe(false);
    expect(g.links.find((l) => l.source === 'unspecified' && l.target === 'budget')).toBeDefined();
    expect(g.links.find((l) => l.source === 'budget' && l.target === 'expenses')).toBeDefined();
  });

  test('deficit: Deficit → Budget (pinned last among inflows), Expenses present, no Surplus', () => {
    const g = buildSankeyGraph(
      [{ id: 1, name: 'Salary', amount: 100000 }],
      [{ id: 1, category_id: 1, name: 'Groceries', amount: 150000 }],
      [catFood]
    );
    expect(byId(g, 'surplus')).toBeUndefined();
    const deficit = g.nodes.find((n) => n.type === 'deficit');
    expect(deficit).toBeDefined();
    const deficitLink = g.links.find((l) => l.source === 'deficit' && l.target === 'budget');
    expect(deficitLink!.value).toBe(50000);

    // Expenses appears even without a Surplus sibling (consistent shape month-to-month).
    expect(byId(g, 'expenses')!.value).toBe(150000);

    const inflowSources = g.links
      .filter((l) => l.target === 'budget')
      .map((l) => byId(g, l.source)!);
    const maxNonDeficitRank = Math.max(
      ...inflowSources.filter((n) => n.type !== 'deficit').map((n) => n.rank)
    );
    expect(deficit!.rank).toBeGreaterThan(maxNonDeficitRank);
    expect(g.links.every((l) => l.value > 0)).toBe(true);
  });

  test('break-even: no Surplus, no Deficit, Budget and Expenses present', () => {
    const g = buildSankeyGraph(
      [{ id: 1, name: 'Salary', amount: 100000 }],
      [{ id: 1, category_id: 1, name: 'Groceries', amount: 100000 }],
      [catFood]
    );
    expect(byId(g, 'surplus')).toBeUndefined();
    expect(g.nodes.some((n) => n.type === 'deficit')).toBe(false);
    expect(byId(g, 'budget')).toBeDefined();
    expect(byId(g, 'expenses')).toBeDefined();
    // income → budget, budget → Expenses, Expenses → Food, Food → Groceries
    expect(g.links).toHaveLength(4);
  });

  test('3-level nested category chain', () => {
    const g = buildSankeyGraph(
      [{ id: 1, name: 'Salary', amount: 200000 }],
      [{ id: 1, category_id: 12, name: 'Bill', amount: 50000 }],
      [catHousing, catUtilities, catElectricity]
    );
    const categoryNodes = g.nodes.filter((n) => n.type === 'category');
    expect(categoryNodes).toHaveLength(3);
    expect(g.links.find((l) => l.source === 'expenses' && l.target === 'cat-10')).toBeDefined();
    expect(g.links.find((l) => l.source === 'cat-10' && l.target === 'cat-11')).toBeDefined();
    expect(g.links.find((l) => l.source === 'cat-11' && l.target === 'cat-12')).toBeDefined();
    expect(g.links.find((l) => l.source === 'cat-12' && l.target === 'exp-1')).toBeDefined();
  });

  test('empty snapshot returns empty graph', () => {
    const g = buildSankeyGraph([], [], []);
    expect(g.nodes).toHaveLength(0);
    expect(g.links).toHaveLength(0);
  });
});

describe('buildSankeyGraph — ordering & detail', () => {
  test('mixed children: a category with both a subcategory and a direct expense', () => {
    // Transport has subcategory Car (with Fuel) AND a direct expense Bus ticket.
    const cats = [
      { id: 2, parent_id: null, name: 'Transport' },
      { id: 3, parent_id: 2, name: 'Car' },
    ];
    const g = buildSankeyGraph(
      [{ id: 1, name: 'Salary', amount: 100000 }],
      [
        { id: 1, category_id: 2, name: 'Bus ticket', amount: 5000 },
        { id: 2, category_id: 3, name: 'Fuel', amount: 30000 },
      ],
      cats
    );
    // Transport emits BOTH a subcategory flow and a direct-expense flow.
    expect(g.links.find((l) => l.source === 'cat-2' && l.target === 'cat-3')).toBeDefined();
    expect(g.links.find((l) => l.source === 'cat-2' && l.target === 'exp-1')).toBeDefined();
    expect(g.links.find((l) => l.source === 'cat-3' && l.target === 'exp-2')).toBeDefined();
  });

  test('children sorted value-descending; DFS leaf (expense) order reflects grouping', () => {
    // Two top cats: Food(150000) before Transport(80000). Within Food: Groceries(100000) before Restaurant(50000).
    const g = buildSankeyGraph(
      [salary, bonus],
      [
        { id: 1, category_id: 1, name: 'Groceries', amount: 100000 },
        { id: 2, category_id: 1, name: 'Restaurant', amount: 50000 },
        { id: 3, category_id: 2, name: 'Gas', amount: 80000 },
      ],
      [catFood, catTransport]
    );
    const expenseOrder = g.nodes
      .filter((n) => n.type === 'expense')
      .sort((a, b) => a.rank - b.rank)
      .map((n) => n.name);
    // Food's expenses are contiguous and value-ordered, then Transport's.
    expect(expenseOrder).toEqual(['Groceries', 'Restaurant', 'Gas']);
  });

  test('tie-break is name ascending then id when values are equal', () => {
    const g = buildSankeyGraph(
      [{ id: 1, name: 'Salary', amount: 100000 }],
      [
        { id: 1, category_id: 1, name: 'Beta', amount: 25000 },
        { id: 2, category_id: 1, name: 'Alpha', amount: 25000 },
      ],
      [catFood]
    );
    const order = g.nodes
      .filter((n) => n.type === 'expense')
      .sort((a, b) => a.rank - b.rank)
      .map((n) => n.name);
    expect(order).toEqual(['Alpha', 'Beta']);
  });

  test('zero-amount income rows and zero-amount expenses are excluded', () => {
    const g = buildSankeyGraph(
      [
        { id: 1, name: 'Salary', amount: 100000 },
        { id: 2, name: 'Ghost', amount: 0 },
      ],
      [
        { id: 1, category_id: 1, name: 'Groceries', amount: 40000 },
        { id: 2, category_id: 1, name: 'Free sample', amount: 0 },
      ],
      [catFood]
    );
    expect(g.nodes.find((n) => n.name === 'Ghost')).toBeUndefined();
    expect(g.nodes.find((n) => n.name === 'Free sample')).toBeUndefined();
    expect(g.links.every((l) => l.value > 0)).toBe(true);
  });

  test('depth is assigned per tree level (income 0, budget 1, expenses/surplus 2, cat 3, nested+1, expense parent+1)', () => {
    const cats = [
      { id: 10, parent_id: null, name: 'Housing' },
      { id: 11, parent_id: 10, name: 'Utilities' },
    ];
    const g = buildSankeyGraph(
      [{ id: 1, name: 'Salary', amount: 200000 }],
      [
        { id: 1, category_id: 11, name: 'Bill', amount: 30000 }, // deep: Housing → Utilities → Bill
        { id: 2, category_id: 10, name: 'Rent', amount: 50000 }, // shallow: Housing → Rent
      ],
      cats
    );
    const depthOf = (id: string) => g.nodes.find((n) => n.id === id)!.depth;
    expect(depthOf('income-1')).toBe(0);
    expect(depthOf('budget')).toBe(1);
    expect(depthOf('expenses')).toBe(2); // Expenses aggregate hangs off Budget
    expect(depthOf('surplus')).toBe(2); // Surplus is its sibling
    expect(depthOf('cat-10')).toBe(3); // Housing (top)
    expect(depthOf('cat-11')).toBe(4); // Utilities (nested)
    expect(depthOf('exp-2')).toBe(4); // Rent, attached to Housing (depth 3) → 4
    expect(depthOf('exp-1')).toBe(5); // Bill, attached to Utilities (depth 4) → 5
  });

  test('top categories cycle through the 8-hue palette; subtree inherits the hue', () => {
    const cats = [
      { id: 1, parent_id: null, name: 'A' },
      { id: 2, parent_id: 1, name: 'A-sub' },
    ];
    const g = buildSankeyGraph(
      [{ id: 1, name: 'Salary', amount: 100000 }],
      [{ id: 1, category_id: 2, name: 'Leaf', amount: 30000 }],
      cats
    );
    const top = g.nodes.find((n) => n.id === 'cat-1')!;
    const sub = g.nodes.find((n) => n.id === 'cat-2')!;
    const leaf = g.nodes.find((n) => n.id === 'exp-1')!;
    expect(sub.color).toBe(top.color);
    expect(leaf.color).toBe(top.color);
  });
});
