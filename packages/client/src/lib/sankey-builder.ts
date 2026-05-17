import { sumTree } from './sum-tree';

export interface SankeyNode {
  id: string;
  label: string;
  type: 'income' | 'expenses' | 'savings' | 'category' | 'unspecified-income' | 'deficit';
}

export interface SankeyLink {
  source: string;
  target: string;
  value: number;
}

export interface SankeyGraph {
  nodes: SankeyNode[];
  links: SankeyLink[];
}

export function buildSankeyGraph(
  incomes: Array<{ id: number; name: string; amount: number }>,
  expenses: Array<{ id: number; name: string; amount: number; category_id: number }>,
  categories: Array<{ id: number; name: string; parent_id: number | null }>
): SankeyGraph {
  const nodes: SankeyNode[] = [];
  const links: SankeyLink[] = [];

  const totalIncome = incomes.reduce((s, i) => s + i.amount, 0);
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const savings = totalIncome - totalExpenses;

  // Nothing to show — let the component render its empty state
  if (incomes.length === 0 && expenses.length === 0) {
    return { nodes: [], links: [] };
  }

  const catTotals = sumTree(categories, expenses);
  const topCats = categories.filter((c) => c.parent_id === null);

  // No income: unspecified source flows to expense categories directly
  if (incomes.length === 0) {
    nodes.push({ id: 'unspecified-income', label: 'Unspecified Income', type: 'unspecified-income' });
    for (const cat of categories) {
      if ((catTotals.get(cat.id) ?? 0) > 0) {
        nodes.push({ id: `cat-${cat.id}`, label: cat.name, type: 'category' });
      }
    }
    for (const cat of topCats) {
      const val = catTotals.get(cat.id) ?? 0;
      if (val > 0) links.push({ source: 'unspecified-income', target: `cat-${cat.id}`, value: val });
    }
    addCategoryLinks(categories, catTotals, links);
    return { nodes, links };
  }

  // No expenses: income flows directly to Savings
  if (expenses.length === 0) {
    for (const income of incomes) {
      nodes.push({ id: `income-${income.id}`, label: income.name, type: 'income' });
    }
    nodes.push({ id: 'savings', label: 'Savings', type: 'savings' });
    for (const income of incomes) {
      links.push({ source: `income-${income.id}`, target: 'savings', value: income.amount });
    }
    return { nodes, links };
  }

  const isDeficit = savings < 0;

  // Income source nodes
  for (const income of incomes) {
    nodes.push({ id: `income-${income.id}`, label: income.name, type: 'income' });
  }

  if (isDeficit) {
    nodes.push({ id: 'deficit', label: 'Deficit', type: 'deficit' });
  }

  // Expenses aggregate node (receives all income; distributes to categories + savings)
  nodes.push({ id: 'expenses', label: 'Expenses', type: 'expenses' });

  if (!isDeficit && savings > 0) {
    nodes.push({ id: 'savings', label: 'Savings', type: 'savings' });
  }

  for (const cat of categories) {
    if ((catTotals.get(cat.id) ?? 0) > 0) {
      nodes.push({ id: `cat-${cat.id}`, label: cat.name, type: 'category' });
    }
  }

  // Income → Expenses
  for (const income of incomes) {
    links.push({ source: `income-${income.id}`, target: 'expenses', value: income.amount });
  }

  // Deficit → Expenses
  if (isDeficit) {
    links.push({ source: 'deficit', target: 'expenses', value: -savings });
  }

  // Expenses → top-level categories
  for (const cat of topCats) {
    const val = catTotals.get(cat.id) ?? 0;
    if (val > 0) links.push({ source: 'expenses', target: `cat-${cat.id}`, value: val });
  }

  // Expenses → Savings (residual)
  if (!isDeficit && savings > 0) {
    links.push({ source: 'expenses', target: 'savings', value: savings });
  }

  addCategoryLinks(categories, catTotals, links);

  return { nodes, links };
}

function addCategoryLinks(
  categories: Array<{ id: number; parent_id: number | null }>,
  catTotals: Map<number, number>,
  links: SankeyLink[]
) {
  for (const cat of categories) {
    const children = categories.filter((c) => c.parent_id === cat.id);
    for (const child of children) {
      const val = catTotals.get(child.id) ?? 0;
      if (val > 0) links.push({ source: `cat-${cat.id}`, target: `cat-${child.id}`, value: val });
    }
  }
}
