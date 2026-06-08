import { useState, useMemo, useEffect } from 'react';
import { trpc } from '../../lib/trpc';
import { useToast } from '../../lib/toast';
import { formatEurCents, centsToEuroStr, eurosToCents, sanitizeEuroInput } from '../../lib/currency';
import { sumTree } from '../../lib/sum-tree';
import { CategoryPicker } from './CategoryPicker';
import { ReorderButtons } from './ReorderButtons';
import { t } from '../../lib/strings';

interface Category {
  id: number;
  name: string;
  parent_id: number | null;
  position: number;
}

interface Expense {
  id: number;
  name: string;
  amount: number;
  category_id: number;
  recurring: number;
  position: number;
}

interface Props {
  snapshotId: number;
  expenses: Expense[];
  categories: Category[];
  editMode: boolean;
  onUpdate: () => void;
}

interface CategoryNode {
  cat: Category;
  children: CategoryNode[];
  expenses: Expense[];
}

// Manual order is the single source of truth: categories and expenses are
// ordered by their stored `position` within each sibling group (id tiebreak).
// Iterating categories in global (position, id) order guarantees that, for any
// one parent, its children land in ascending position order.
function byPosition<T extends { position: number; id: number }>(a: T, b: T): number {
  return a.position - b.position || a.id - b.id;
}

function buildTree(categories: Category[], expenses: Expense[]): CategoryNode[] {
  const sorted = [...categories].sort(byPosition);
  const map = new Map<number, CategoryNode>();
  for (const cat of sorted) map.set(cat.id, { cat, children: [], expenses: [] });
  for (const e of expenses) map.get(e.category_id)?.expenses.push(e);
  const roots: CategoryNode[] = [];
  for (const cat of sorted) {
    const node = map.get(cat.id)!;
    if (cat.parent_id === null) {
      roots.push(node);
    } else {
      map.get(cat.parent_id)?.children.push(node);
    }
  }
  // Sort expenses within each node by manual position
  for (const node of map.values()) {
    node.expenses.sort(byPosition);
  }
  return roots;
}

// ─── Indent ───────────────────────────────────────────────────────────────────

// A single fixed-width spacer per nesting level. Depth-based indentation is
// what conveys the tree structure (no vertical guide lines).
function Indent({ depth }: { depth: number }) {
  return depth > 0 ? <span className="shrink-0" style={{ width: `${depth * 20}px` }} /> : null;
}

// ─── Expense row ──────────────────────────────────────────────────────────────

interface ExpenseRowProps {
  expense: Expense;
  depth: number;
  index: number;
  siblingIds: number[];
  snapshotId: number;
  categories: Category[];
  editMode: boolean;
  onUpdate: () => void;
  onCategoriesUpdate: (cat: Category) => void;
  onMoveExpense: (categoryId: number, siblingIds: number[], index: number, dir: 'up' | 'down') => void;
  expensesPending: boolean;
}

function ExpenseRow({
  expense,
  depth,
  index,
  siblingIds,
  snapshotId,
  categories,
  editMode,
  onUpdate,
  onCategoriesUpdate,
  onMoveExpense,
  expensesPending,
}: ExpenseRowProps) {
  const { showToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(expense.name);
  const [amount, setAmount] = useState(centsToEuroStr(expense.amount));
  const [recurring, setRecurring] = useState(expense.recurring === 1);
  const [categoryId, setCategoryId] = useState(expense.category_id);

  const upsertMut = trpc.expenses.upsert.useMutation({
    onSuccess: () => { onUpdate(); setEditing(false); },
    onError: (err) => showToast(err.message),
  });

  const deleteMut = trpc.expenses.delete.useMutation({
    onSuccess: onUpdate,
    onError: (err) => showToast(err.message),
  });

  function handleSave() {
    const parsedAmount = eurosToCents(amount);
    if (parsedAmount === null || parsedAmount < 0) { showToast(t.amountNonNegative); return; }
    upsertMut.mutate({
      id: expense.id,
      snapshotId,
      name: name.trim(),
      amount: parsedAmount,
      categoryId,
      recurring,
    });
  }

  if (editing) {
    return (
      <div className="flex items-stretch bg-blue-50 border-b border-gray-100 pl-2">
        <Indent depth={depth + 1} />
        <div className="flex flex-col gap-2 py-2 pr-3 flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditing(false); }}
              className="border border-gray-300 rounded px-2 py-1 text-sm flex-1"
              placeholder={t.expenseName}
            />
            <input
              type="number"
              min="0"
              step="1"
              value={amount}
              onChange={(e) => setAmount(sanitizeEuroInput(e.target.value))}
              className="border border-gray-300 rounded px-2 py-1 text-sm w-28 text-right"
              placeholder="0"
            />
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-gray-500">{t.categoryLabel}</span>
            <CategoryPicker
              snapshotId={snapshotId}
              categories={categories}
              value={categoryId}
              onChange={setCategoryId}
              onCategoriesUpdate={onCategoriesUpdate}
            />
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={recurring}
                onChange={(e) => setRecurring(e.target.checked)}
                className="rounded"
              />
              {t.recurring}
            </label>
            <div className="flex gap-2 ml-auto">
              <button
                onClick={handleSave}
                disabled={upsertMut.isLoading}
                className="text-xs bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700 disabled:opacity-50"
              >
                {upsertMut.isLoading ? t.saving : t.save}
              </button>
              <button onClick={() => setEditing(false)} className="text-xs text-gray-500 hover:text-gray-700 px-1">
                {t.cancel}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-stretch hover:bg-gray-50 border-b border-gray-100 last:border-0 pl-2">
      <Indent depth={depth + 1} />
      <div className="flex items-center justify-between flex-1 min-w-0 py-1.5 pr-3">
        <span className="flex items-center gap-2 min-w-0">
          <span className="text-sm text-gray-700 truncate">{expense.name}</span>
          {expense.recurring === 1 && (
            <span className="text-xs text-gray-400 shrink-0" title={t.recurring}>↻</span>
          )}
        </span>
        <span className="flex items-center gap-3 shrink-0 ml-4">
          <span className="text-sm tabular-nums text-gray-800">{formatEurCents(expense.amount)}</span>
          {editMode && (
            <>
              <ReorderButtons
                canMoveUp={index > 0}
                canMoveDown={index < siblingIds.length - 1}
                pending={expensesPending}
                onMoveUp={() => onMoveExpense(expense.category_id, siblingIds, index, 'up')}
                onMoveDown={() => onMoveExpense(expense.category_id, siblingIds, index, 'down')}
              />
              <button onClick={() => setEditing(true)} className="text-xs text-blue-500 hover:text-blue-700">
                {t.edit}
              </button>
              <button
                onClick={() => deleteMut.mutate({ id: expense.id, snapshotId })}
                disabled={deleteMut.isLoading}
                className="text-xs text-red-400 hover:text-red-600 disabled:opacity-50"
              >
                {deleteMut.isLoading ? '…' : t.delete}
              </button>
            </>
          )}
        </span>
      </div>
    </div>
  );
}

// ─── Add expense row ──────────────────────────────────────────────────────────

interface AddExpenseRowProps {
  snapshotId: number;
  depth: number;
  defaultCategoryId: number;
  categories: Category[];
  onSuccess: () => void;
  onClose: () => void;
  onCategoriesUpdate: (cat: Category) => void;
}

function AddExpenseRow({
  snapshotId,
  depth,
  defaultCategoryId,
  categories,
  onSuccess,
  onClose,
  onCategoriesUpdate,
}: AddExpenseRowProps) {
  const { showToast } = useToast();
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [recurring, setRecurring] = useState(false);
  const [categoryId, setCategoryId] = useState(defaultCategoryId);

  const upsertMut = trpc.expenses.upsert.useMutation({
    onSuccess: () => { onSuccess(); onClose(); },
    onError: (err) => showToast(err.message),
  });

  function handleSave() {
    const parsedAmount = eurosToCents(amount);
    if (!name.trim()) { showToast(t.nameRequired); return; }
    if (parsedAmount === null || parsedAmount < 0) { showToast(t.amountNonNegative); return; }
    upsertMut.mutate({ snapshotId, name: name.trim(), amount: parsedAmount, categoryId, recurring });
  }

  return (
    <div className="flex items-stretch bg-green-50 border-b border-gray-100 pl-2">
      <Indent depth={depth + 1} />
      <div className="flex flex-col gap-2 py-2 pr-3 flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onClose(); }}
            className="border border-gray-300 rounded px-2 py-1 text-sm flex-1"
            placeholder={t.expenseName}
          />
          <input
            type="number"
            min="0"
            step="1"
            value={amount}
            onChange={(e) => setAmount(sanitizeEuroInput(e.target.value))}
            className="border border-gray-300 rounded px-2 py-1 text-sm w-28 text-right"
            placeholder="0"
          />
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-gray-500">{t.categoryLabel}</span>
          <CategoryPicker
            snapshotId={snapshotId}
            categories={categories}
            value={categoryId}
            onChange={setCategoryId}
            onCategoriesUpdate={onCategoriesUpdate}
          />
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={recurring}
              onChange={(e) => setRecurring(e.target.checked)}
              className="rounded"
            />
            {t.recurring}
          </label>
          <div className="flex gap-2 ml-auto">
            <button
              onClick={handleSave}
              disabled={upsertMut.isLoading}
              className="text-xs bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700 disabled:opacity-50"
            >
              {upsertMut.isLoading ? t.saving : t.add}
            </button>
            <button onClick={onClose} className="text-xs text-gray-500 hover:text-gray-700 px-1">{t.cancel}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Category node ────────────────────────────────────────────────────────────

type MoveFn = (scopeId: number | null, siblingIds: number[], index: number, dir: 'up' | 'down') => void;

interface CategoryNodeRowProps {
  node: CategoryNode;
  depth: number;
  index: number;
  siblingIds: number[];
  parentId: number | null;
  snapshotId: number;
  allCategories: Category[];
  totals: Map<number, number>;
  editMode: boolean;
  collapsedIds: Set<number>;
  onToggleCollapse: (id: number) => void;
  onUpdate: () => void;
  onCategoriesUpdate: (cat: Category) => void;
  onMoveCategory: MoveFn;
  onMoveExpense: (categoryId: number, siblingIds: number[], index: number, dir: 'up' | 'down') => void;
  categoriesPending: boolean;
  expensesPending: boolean;
}

function CategoryNodeRow({
  node,
  depth,
  index,
  siblingIds,
  parentId,
  snapshotId,
  allCategories,
  totals,
  editMode,
  collapsedIds,
  onToggleCollapse,
  onUpdate,
  onCategoriesUpdate,
  onMoveCategory,
  onMoveExpense,
  categoriesPending,
  expensesPending,
}: CategoryNodeRowProps) {
  const { showToast } = useToast();
  const collapsed = collapsedIds.has(node.cat.id);
  const [renaming, setRenaming] = useState(false);
  const [renameName, setRenameName] = useState(node.cat.name);
  const [addingExpense, setAddingExpense] = useState(false);
  const [addingSubcat, setAddingSubcat] = useState(false);
  const [subcatName, setSubcatName] = useState('');
  const [pendingDelete, setPendingDelete] = useState(false);
  const [preview, setPreview] = useState<{
    subcategoryCount: number;
    expenseCount: number;
    totalAmount: number;
  } | null>(null);

  const subtotal = totals.get(node.cat.id) ?? 0;

  const updateMut = trpc.categories.update.useMutation({
    onSuccess: () => { onUpdate(); setRenaming(false); },
    onError: (err) => showToast(err.message),
  });

  const createSubcatMut = trpc.categories.create.useMutation({
    onSuccess: (cat) => { onCategoriesUpdate(cat); onUpdate(); setAddingSubcat(false); setSubcatName(''); },
    onError: (err) => showToast(err.message),
  });

  const previewQuery = trpc.categories.deletePreview.useQuery(
    { id: node.cat.id, snapshotId },
    { enabled: pendingDelete, onSuccess: setPreview }
  );

  const deleteMut = trpc.categories.delete.useMutation({
    onSuccess: () => { onUpdate(); setPendingDelete(false); },
    onError: (err) => showToast(err.message),
  });

  const hasContent = node.expenses.length > 0 || node.children.length > 0;

  return (
    <>
      {/* Category header row */}
      <div className="flex items-stretch bg-gray-50 border-b border-gray-200 hover:bg-gray-100 pl-2">
        <Indent depth={depth} />
        <div className="flex items-center justify-between flex-1 min-w-0 py-1.5 pr-3">
          <span className="flex items-center min-w-0">
            <span className="w-5 shrink-0 flex items-center text-xs">
              {hasContent && (
                <button
                  onClick={() => onToggleCollapse(node.cat.id)}
                  aria-label={collapsed ? t.expandCategory : t.collapseCategory}
                  className="text-gray-400 hover:text-gray-600"
                >
                  {collapsed ? '▶' : '▼'}
                </button>
              )}
            </span>

            {renaming ? (
              <span className="flex items-center gap-2 flex-1">
                <input
                  autoFocus
                  value={renameName}
                  onChange={(e) => setRenameName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') updateMut.mutate({ id: node.cat.id, snapshotId, name: renameName.trim() });
                    if (e.key === 'Escape') setRenaming(false);
                  }}
                  className="border border-gray-300 rounded px-2 py-0.5 text-sm flex-1 max-w-xs"
                />
                <button
                  onClick={() => updateMut.mutate({ id: node.cat.id, snapshotId, name: renameName.trim() })}
                  disabled={updateMut.isLoading}
                  className="text-xs text-green-700 hover:text-green-900 font-medium"
                >
                  {t.save}
                </button>
                <button onClick={() => setRenaming(false)} className="text-xs text-gray-400 hover:text-gray-600">{t.cancel}</button>
              </span>
            ) : (
              <span className="flex items-center gap-2 min-w-0">
                <span className={`text-sm font-medium truncate ${hasContent ? 'text-gray-800' : 'text-gray-400'}`}>
                  {node.cat.name}
                </span>
                {!hasContent && <span className="text-xs font-normal text-gray-400 shrink-0">{t.emptyCategory}</span>}
              </span>
            )}
          </span>

          <span className="flex items-center gap-3 shrink-0 ml-4">
            <span className={`text-sm tabular-nums font-medium ${hasContent ? 'text-gray-600' : 'text-gray-400'}`}>{formatEurCents(subtotal)}</span>
            {editMode && !renaming && (
              <span className="flex items-center gap-1">
                <ReorderButtons
                  canMoveUp={index > 0}
                  canMoveDown={index < siblingIds.length - 1}
                  pending={categoriesPending}
                  onMoveUp={() => onMoveCategory(parentId, siblingIds, index, 'up')}
                  onMoveDown={() => onMoveCategory(parentId, siblingIds, index, 'down')}
                />
                <button
                  onClick={() => setAddingExpense(true)}
                  title={t.addExpense}
                  className="text-xs text-green-600 hover:text-green-800 px-1"
                >
                  {t.addExpenseShort}
                </button>
                <button
                  onClick={() => setAddingSubcat(true)}
                  title={t.addSubcategory}
                  className="text-xs text-blue-500 hover:text-blue-700 px-1"
                >
                  {t.addSubcategoryShort}
                </button>
                <button
                  onClick={() => { setRenameName(node.cat.name); setRenaming(true); }}
                  className="text-xs text-gray-400 hover:text-gray-600 px-1"
                >
                  {t.rename}
                </button>
                <button
                  onClick={() => setPendingDelete(true)}
                  className="text-xs text-red-400 hover:text-red-600 px-1"
                >
                  {t.delete}
                </button>
              </span>
            )}
          </span>
        </div>
      </div>

      {/* Add subcategory row */}
      {addingSubcat && (
        <div className="flex items-stretch bg-blue-50 border-b border-gray-200 pl-2">
          <Indent depth={depth + 1} />
          <div className="flex items-center gap-2 py-2 pr-3 flex-1 min-w-0">
            <input
              autoFocus
              value={subcatName}
              onChange={(e) => setSubcatName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') createSubcatMut.mutate({ snapshotId, name: subcatName.trim(), parentId: node.cat.id });
                if (e.key === 'Escape') { setAddingSubcat(false); setSubcatName(''); }
              }}
              className="border border-gray-300 rounded px-2 py-1 text-sm flex-1 max-w-xs"
              placeholder={t.subcategoryName}
            />
            <button
              onClick={() => createSubcatMut.mutate({ snapshotId, name: subcatName.trim(), parentId: node.cat.id })}
              disabled={createSubcatMut.isLoading}
              className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {t.add}
            </button>
            <button onClick={() => { setAddingSubcat(false); setSubcatName(''); }} className="text-xs text-gray-500 hover:text-gray-700">
              {t.cancel}
            </button>
          </div>
        </div>
      )}

      {/* Children and expenses (collapsible) */}
      {!collapsed && (
        <>
          {node.children.map((child, i) => (
            <CategoryNodeRow
              key={child.cat.id}
              node={child}
              depth={depth + 1}
              index={i}
              siblingIds={node.children.map((c) => c.cat.id)}
              parentId={node.cat.id}
              snapshotId={snapshotId}
              allCategories={allCategories}
              totals={totals}
              editMode={editMode}
              collapsedIds={collapsedIds}
              onToggleCollapse={onToggleCollapse}
              onUpdate={onUpdate}
              onCategoriesUpdate={onCategoriesUpdate}
              onMoveCategory={onMoveCategory}
              onMoveExpense={onMoveExpense}
              categoriesPending={categoriesPending}
              expensesPending={expensesPending}
            />
          ))}

          {node.expenses.map((expense, i) => (
            <ExpenseRow
              key={expense.id}
              expense={expense}
              depth={depth}
              index={i}
              siblingIds={node.expenses.map((e) => e.id)}
              snapshotId={snapshotId}
              categories={allCategories}
              editMode={editMode}
              onUpdate={onUpdate}
              onCategoriesUpdate={onCategoriesUpdate}
              onMoveExpense={onMoveExpense}
              expensesPending={expensesPending}
            />
          ))}

          {addingExpense && (
            <AddExpenseRow
              snapshotId={snapshotId}
              depth={depth}
              defaultCategoryId={node.cat.id}
              categories={allCategories}
              onSuccess={onUpdate}
              onClose={() => setAddingExpense(false)}
              onCategoriesUpdate={onCategoriesUpdate}
            />
          )}
        </>
      )}

      {/* Delete confirmation dialog */}
      {pendingDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-96">
            <h2 className="text-base font-semibold mb-2">{t.deleteCategoryTitle}</h2>
            {previewQuery.isLoading ? (
              <p className="text-sm text-gray-500 mb-5">{t.loading}</p>
            ) : previewQuery.isError ? (
              <p className="text-sm text-red-600 mb-5">
                {t.deletePreviewError}
              </p>
            ) : preview ? (
              <p className="text-sm text-gray-600 mb-5">
                {preview.subcategoryCount > 0 || preview.expenseCount > 0
                  ? t.deleteCategoryBody(
                      preview.subcategoryCount,
                      preview.expenseCount,
                      formatEurCents(preview.totalAmount)
                    )
                  : t.deleteEmptyCategory}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <button onClick={() => setPendingDelete(false)} className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900">
                {t.cancel}
              </button>
              <button
                onClick={() => deleteMut.mutate({ id: node.cat.id, snapshotId })}
                disabled={deleteMut.isLoading || previewQuery.isLoading || previewQuery.isError}
                className="bg-red-600 text-white px-4 py-1.5 rounded text-sm font-medium hover:bg-red-700 disabled:opacity-50"
              >
                {deleteMut.isLoading ? t.deleting : t.delete}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Top-level component ──────────────────────────────────────────────────────

export function ExpenseTree({ snapshotId, expenses, categories, editMode, onUpdate }: Props) {
  const [localCategories, setLocalCategories] = useState<Category[]>([]);

  // Server categories are authoritative & complete; once a refetch lands,
  // the local optimistic cache is redundant. Clearing it also drops
  // session-created categories that have since been deleted server-side.
  useEffect(() => {
    setLocalCategories([]);
  }, [categories]);

  const [addingTopCat, setAddingTopCat] = useState(false);
  const [topCatName, setTopCatName] = useState('');
  const { showToast } = useToast();

  const createCatMut = trpc.categories.create.useMutation({
    onSuccess: (cat) => {
      setLocalCategories((prev) => {
        const byId = new Map(prev.map((c) => [c.id, c]));
        byId.set(cat.id, cat);
        return Array.from(byId.values());
      });
      onUpdate();
      setAddingTopCat(false);
      setTopCatName('');
    },
    onError: (err) => showToast(err.message),
  });

  const reorderCategoriesMut = trpc.categories.reorder.useMutation({
    onSuccess: () => onUpdate(),
    onError: (err) => showToast(err.message),
  });

  const reorderExpensesMut = trpc.expenses.reorder.useMutation({
    onSuccess: () => onUpdate(),
    onError: (err) => showToast(err.message),
  });

  function moveCategory(parentId: number | null, siblingIds: number[], index: number, dir: 'up' | 'down') {
    const target = dir === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= siblingIds.length) return;
    const orderedIds = [...siblingIds];
    [orderedIds[index], orderedIds[target]] = [orderedIds[target], orderedIds[index]];
    reorderCategoriesMut.mutate({ snapshotId, parentId, orderedIds });
  }

  function moveExpense(categoryId: number, siblingIds: number[], index: number, dir: 'up' | 'down') {
    const target = dir === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= siblingIds.length) return;
    const orderedIds = [...siblingIds];
    [orderedIds[index], orderedIds[target]] = [orderedIds[target], orderedIds[index]];
    reorderExpensesMut.mutate({ snapshotId, categoryId, orderedIds });
  }

  const allCategories = useMemo(() => {
    const byId = new Map<number, Category>();
    // Local entries first; prop (server) entries overwrite so server-normalised data always wins
    for (const c of localCategories) byId.set(c.id, c);
    for (const c of categories) byId.set(c.id, c);
    return Array.from(byId.values());
  }, [categories, localCategories]);

  const totals = useMemo(() => sumTree(allCategories, expenses), [allCategories, expenses]);

  const tree = useMemo(() => buildTree(allCategories, expenses), [allCategories, expenses]);

  // Only categories with content render a per-row toggle, so only those are
  // "collapsible" and counted when deciding the collapse/expand-all button state.
  const collapsibleIds = useMemo(() => {
    const ids: number[] = [];
    const walk = (nodes: CategoryNode[]) => {
      for (const n of nodes) {
        if (n.expenses.length > 0 || n.children.length > 0) ids.push(n.cat.id);
        walk(n.children);
      }
    };
    walk(tree);
    return ids;
  }, [tree]);

  const [collapsedIds, setCollapsedIds] = useState<Set<number>>(new Set());

  const allCollapsed =
    collapsibleIds.length > 0 && collapsibleIds.every((id) => collapsedIds.has(id));

  function toggleAll() {
    setCollapsedIds(allCollapsed ? new Set() : new Set(collapsibleIds));
  }

  function toggleOne(id: number) {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);

  function handleCategoriesUpdate(cat: Category) {
    setLocalCategories((prev) => {
      const byId = new Map(prev.map((c) => [c.id, c]));
      byId.set(cat.id, cat);
      return Array.from(byId.values());
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">{t.expenses}</h2>
        {collapsibleIds.length > 0 && (
          <button onClick={toggleAll} className="text-xs text-gray-500 hover:text-gray-700">
            {allCollapsed ? t.expandAll : t.collapseAll}
          </button>
        )}
      </div>
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        {allCategories.length === 0 && expenses.length === 0 && !editMode ? (
          <div className="py-8 text-center text-gray-400 text-sm">
            {t.noExpensesView}
          </div>
        ) : (
          <>
            {tree.length === 0 && editMode && (
              <div className="py-4 text-center text-gray-400 text-sm">
                {t.noCategories}
              </div>
            )}

            {tree.map((node, index) => (
              <CategoryNodeRow
                key={node.cat.id}
                node={node}
                depth={0}
                index={index}
                siblingIds={tree.map((n) => n.cat.id)}
                parentId={null}
                snapshotId={snapshotId}
                allCategories={allCategories}
                totals={totals}
                editMode={editMode}
                collapsedIds={collapsedIds}
                onToggleCollapse={toggleOne}
                onUpdate={onUpdate}
                onCategoriesUpdate={handleCategoriesUpdate}
                onMoveCategory={moveCategory}
                onMoveExpense={moveExpense}
                categoriesPending={reorderCategoriesMut.isLoading}
                expensesPending={reorderExpensesMut.isLoading}
              />
            ))}

            {/* Add top-level category */}
            {editMode && (
              addingTopCat ? (
                <div className="flex items-center gap-2 p-3 border-t border-gray-200 bg-blue-50">
                  <input
                    autoFocus
                    value={topCatName}
                    onChange={(e) => setTopCatName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') createCatMut.mutate({ snapshotId, name: topCatName.trim() });
                      if (e.key === 'Escape') { setAddingTopCat(false); setTopCatName(''); }
                    }}
                    className="border border-gray-300 rounded px-2 py-1 text-sm flex-1 max-w-xs"
                    placeholder={t.newCategoryName}
                  />
                  <button
                    onClick={() => createCatMut.mutate({ snapshotId, name: topCatName.trim() })}
                    disabled={createCatMut.isLoading}
                    className="text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 disabled:opacity-50"
                  >
                    {t.add}
                  </button>
                  <button
                    onClick={() => { setAddingTopCat(false); setTopCatName(''); }}
                    className="text-xs text-gray-500 hover:text-gray-700"
                  >
                    {t.cancel}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setAddingTopCat(true)}
                  className="w-full text-left py-2 px-3 text-sm text-blue-600 hover:text-blue-800 hover:bg-gray-50 border-t border-gray-200"
                >
                  {t.newCategory}
                </button>
              )
            )}

            {/* Total row */}
            {(allCategories.length > 0 || expenses.length > 0) && (
              <div className="flex justify-between items-center px-3 py-2 border-t border-gray-300 bg-gray-50">
                <span className="text-sm font-semibold text-gray-700">{t.totalExpenses}</span>
                <span className="text-sm font-semibold tabular-nums">{formatEurCents(totalExpenses)}</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
