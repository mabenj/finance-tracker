import { describe, test, expect } from 'bun:test';
import { buildSankeyGraph } from './sankey-builder';

const salary = { id: 1, name: 'Salary', amount: 300000 };
const bonus = { id: 2, name: 'Bonus', amount: 200000 };

const catFood = { id: 1, parent_id: null, name: 'Food' };
const catTransport = { id: 2, parent_id: null, name: 'Transport' };

// Use ids 10/11/12 to avoid collisions with catFood(1) and catTransport(2).
const catHousing = { id: 10, parent_id: null, name: 'Housing' };
const catUtilities = { id: 11, parent_id: 10, name: 'Utilities' };
const catElectricity = { id: 12, parent_id: 11, name: 'Electricity' };

describe('buildSankeyGraph', () => {
  test('normal case: 2 incomes, 3 expenses across 2 categories', () => {
    const incomes = [salary, bonus]; // total = 500000
    const categories = [catFood, catTransport];
    const expenses = [
      { id: 1, category_id: 1, name: 'Groceries', amount: 100000 },
      { id: 2, category_id: 1, name: 'Restaurant', amount: 50000 },
      { id: 3, category_id: 2, name: 'Gas', amount: 80000 },
    ]; // total = 230000, savings = 270000

    const graph = buildSankeyGraph(incomes, expenses, categories);

    // 2 income nodes + Expenses + Savings + 2 category nodes
    expect(graph.nodes).toHaveLength(6);
    // 2 income→Expenses + Expenses→Food + Expenses→Transport + Expenses→Savings
    expect(graph.links).toHaveLength(5);
    expect(graph.links.every((l) => l.value > 0)).toBe(true);

    const savingsLink = graph.links.find((l) => l.target === 'savings');
    expect(savingsLink).toBeDefined();
    expect(savingsLink!.value).toBe(270000);
  });

  test('no expenses: income flows entirely to Savings, no Expenses node', () => {
    const incomes = [salary, bonus]; // total = 500000
    const graph = buildSankeyGraph(incomes, [], []);

    expect(graph.nodes.find((n) => n.id === 'expenses')).toBeUndefined();
    expect(graph.nodes.find((n) => n.id === 'savings')).toBeDefined();
    expect(graph.links.every((l) => l.value > 0)).toBe(true);

    const totalSavingsFlow = graph.links
      .filter((l) => l.target === 'savings')
      .reduce((s, l) => s + l.value, 0);
    expect(totalSavingsFlow).toBe(500000);
  });

  test('no income: single Unspecified Income source node, no Savings', () => {
    const categories = [catFood];
    const expenses = [{ id: 1, category_id: 1, name: 'Groceries', amount: 100000 }];

    const graph = buildSankeyGraph([], expenses, categories);

    const unspecified = graph.nodes.filter((n) => n.type === 'unspecified-income');
    expect(unspecified).toHaveLength(1);
    expect(graph.nodes.find((n) => n.id === 'savings')).toBeUndefined();
  });

  test('deficit: no Savings, Deficit source node value = expenses - income', () => {
    const incomes = [{ id: 1, name: 'Salary', amount: 100000 }];
    const categories = [catFood];
    const expenses = [{ id: 1, category_id: 1, name: 'Groceries', amount: 150000 }];
    // deficit = 150000 - 100000 = 50000

    const graph = buildSankeyGraph(incomes, expenses, categories);

    expect(graph.nodes.find((n) => n.id === 'savings')).toBeUndefined();
    const deficitNode = graph.nodes.find((n) => n.type === 'deficit');
    expect(deficitNode).toBeDefined();

    const deficitLink = graph.links.find((l) => l.source === 'deficit');
    expect(deficitLink).toBeDefined();
    expect(deficitLink!.value).toBe(50000);
    expect(graph.links.every((l) => l.value > 0)).toBe(true);
  });

  test('3-level nested category: 3 category nodes, links chain correctly', () => {
    const incomes = [{ id: 1, name: 'Salary', amount: 200000 }];
    const categories = [catHousing, catUtilities, catElectricity];
    const expenses = [{ id: 1, category_id: 12, name: 'Bill', amount: 50000 }];
    // savings = 150000

    const graph = buildSankeyGraph(incomes, expenses, categories);

    const categoryNodes = graph.nodes.filter((n) => n.type === 'category');
    expect(categoryNodes).toHaveLength(3);

    // Chain: Expenses → Housing → Utilities → Electricity
    expect(graph.links.find((l) => l.source === 'expenses' && l.target === 'cat-10')).toBeDefined();
    expect(graph.links.find((l) => l.source === 'cat-10' && l.target === 'cat-11')).toBeDefined();
    expect(graph.links.find((l) => l.source === 'cat-11' && l.target === 'cat-12')).toBeDefined();
  });

  test('break-even (savings = 0): no Savings node, no Deficit node, flow balanced', () => {
    const incomes = [{ id: 1, name: 'Salary', amount: 100000 }];
    const categories = [catFood];
    const expenses = [{ id: 1, category_id: 1, name: 'Groceries', amount: 100000 }];
    // savings = 0

    const graph = buildSankeyGraph(incomes, expenses, categories);

    expect(graph.nodes.find((n) => n.id === 'savings')).toBeUndefined();
    expect(graph.nodes.find((n) => n.type === 'deficit')).toBeUndefined();
    expect(graph.nodes.find((n) => n.id === 'expenses')).toBeDefined();
    // income → Expenses, Expenses → Food
    expect(graph.links).toHaveLength(2);
    expect(graph.links.every((l) => l.value > 0)).toBe(true);
  });

  test('empty snapshot (no income and no expenses): returns empty graph', () => {
    const graph = buildSankeyGraph([], [], []);
    expect(graph.nodes).toHaveLength(0);
    expect(graph.links).toHaveLength(0);
  });
});
