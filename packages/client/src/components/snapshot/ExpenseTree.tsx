import { useState, useMemo, useEffect } from 'react';
import { trpc } from '../../lib/trpc';
import { useToast } from '../../lib/toast';
import { formatEurCents, centsToEuroStr, eurosToCents, sanitizeEuroInput } from '../../lib/currency';
import { sumTree } from '../../lib/sum-tree';
import { CategoryPicker } from './CategoryPicker';

interface Category {
  id: number;
  name: string;
  parent_id: number | null;
}

interface Expense {
  id: number;
  name: string;
  amount: number;
  category_id: number;
  recurring: number;
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

function buildTree(categories: Category[], expenses: Expense[]): CategoryNode[] {
  const sorted = [...categories].sort((a, b) => a.name.localeCompare(b.name));
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
  // Sort expenses within each node by amount descending
  for (const node of map.values()) {
    node.expenses.sort((a, b) => b.amount - a.amount);
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
  snapshotId: number;
  categories: Category[];
  editMode: boolean;
  onUpdate: () => void;
  onCategoriesUpdate: (cat: Category) => void;
}

function ExpenseRow({
  expense,
  depth,
  snapshotId,
  categories,
  editMode,
  onUpdate,
  onCategoriesUpdate,
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
    if (parsedAmount === null || parsedAmount < 0) { showToast('Amount must be zero or positive'); return; }
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
              placeholder="Expense name"
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
            <span className="text-gray-500">Category:</span>
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
              Recurring
            </label>
            <div className="flex gap-2 ml-auto">
              <button
                onClick={handleSave}
                disabled={upsertMut.isLoading}
                className="text-xs bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700 disabled:opacity-50"
              >
                {upsertMut.isLoading ? 'Saving…' : 'Save'}
              </button>
              <button onClick={() => setEditing(false)} className="text-xs text-gray-500 hover:text-gray-700 px-1">
                Cancel
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
            <span className="text-xs text-gray-400 shrink-0" title="Recurring">↻</span>
          )}
        </span>
        <span className="flex items-center gap-3 shrink-0 ml-4">
          <span className="text-sm tabular-nums text-gray-800">{formatEurCents(expense.amount)}</span>
          {editMode && (
            <>
              <button onClick={() => setEditing(true)} className="text-xs text-blue-500 hover:text-blue-700">
                Edit
              </button>
              <button
                onClick={() => deleteMut.mutate({ id: expense.id, snapshotId })}
                disabled={deleteMut.isLoading}
                className="text-xs text-red-400 hover:text-red-600 disabled:opacity-50"
              >
                {deleteMut.isLoading ? '…' : 'Delete'}
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
    if (!name.trim()) { showToast('Name is required'); return; }
    if (parsedAmount === null || parsedAmount < 0) { showToast('Amount must be zero or positive'); return; }
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
            placeholder="Expense name"
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
          <span className="text-gray-500">Category:</span>
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
            Recurring
          </label>
          <div className="flex gap-2 ml-auto">
            <button
              onClick={handleSave}
              disabled={upsertMut.isLoading}
              className="text-xs bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700 disabled:opacity-50"
            >
              {upsertMut.isLoading ? 'Saving…' : 'Add'}
            </button>
            <button onClick={onClose} className="text-xs text-gray-500 hover:text-gray-700 px-1">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Category node ────────────────────────────────────────────────────────────

interface CategoryNodeRowProps {
  node: CategoryNode;
  depth: number;
  snapshotId: number;
  allCategories: Category[];
  totals: Map<number, number>;
  editMode: boolean;
  onUpdate: () => void;
  onCategoriesUpdate: (cat: Category) => void;
}

function CategoryNodeRow({
  node,
  depth,
  snapshotId,
  allCategories,
  totals,
  editMode,
  onUpdate,
  onCategoriesUpdate,
}: CategoryNodeRowProps) {
  const { showToast } = useToast();
  const [collapsed, setCollapsed] = useState(false);
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
                  onClick={() => setCollapsed((c) => !c)}
                  aria-label={collapsed ? 'Expand category' : 'Collapse category'}
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
                  Save
                </button>
                <button onClick={() => setRenaming(false)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
              </span>
            ) : (
              <span className="flex items-center gap-2 min-w-0">
                <span className={`text-sm font-medium truncate ${hasContent ? 'text-gray-800' : 'text-gray-400'}`}>
                  {node.cat.name}
                </span>
                {!hasContent && <span className="text-xs font-normal text-gray-400 shrink-0">empty</span>}
              </span>
            )}
          </span>

          <span className="flex items-center gap-3 shrink-0 ml-4">
            <span className={`text-sm tabular-nums font-medium ${hasContent ? 'text-gray-600' : 'text-gray-400'}`}>{formatEurCents(subtotal)}</span>
            {editMode && !renaming && (
              <span className="flex gap-1">
                <button
                  onClick={() => setAddingExpense(true)}
                  title="Add expense"
                  className="text-xs text-green-600 hover:text-green-800 px-1"
                >
                  + Expense
                </button>
                <button
                  onClick={() => setAddingSubcat(true)}
                  title="Add subcategory"
                  className="text-xs text-blue-500 hover:text-blue-700 px-1"
                >
                  + Sub
                </button>
                <button
                  onClick={() => { setRenameName(node.cat.name); setRenaming(true); }}
                  className="text-xs text-gray-400 hover:text-gray-600 px-1"
                >
                  Rename
                </button>
                <button
                  onClick={() => setPendingDelete(true)}
                  className="text-xs text-red-400 hover:text-red-600 px-1"
                >
                  Delete
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
              placeholder="Subcategory name"
            />
            <button
              onClick={() => createSubcatMut.mutate({ snapshotId, name: subcatName.trim(), parentId: node.cat.id })}
              disabled={createSubcatMut.isLoading}
              className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 disabled:opacity-50"
            >
              Add
            </button>
            <button onClick={() => { setAddingSubcat(false); setSubcatName(''); }} className="text-xs text-gray-500 hover:text-gray-700">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Children and expenses (collapsible) */}
      {!collapsed && (
        <>
          {node.children.map((child) => (
            <CategoryNodeRow
              key={child.cat.id}
              node={child}
              depth={depth + 1}
              snapshotId={snapshotId}
              allCategories={allCategories}
              totals={totals}
              editMode={editMode}
              onUpdate={onUpdate}
              onCategoriesUpdate={onCategoriesUpdate}
            />
          ))}

          {node.expenses.map((expense) => (
            <ExpenseRow
              key={expense.id}
              expense={expense}
              depth={depth}
              snapshotId={snapshotId}
              categories={allCategories}
              editMode={editMode}
              onUpdate={onUpdate}
              onCategoriesUpdate={onCategoriesUpdate}
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
            <h2 className="text-base font-semibold mb-2">Delete category?</h2>
            {previewQuery.isLoading ? (
              <p className="text-sm text-gray-500 mb-5">Loading…</p>
            ) : previewQuery.isError ? (
              <p className="text-sm text-red-600 mb-5">
                Could not load deletion preview. Please close and try again.
              </p>
            ) : preview ? (
              <p className="text-sm text-gray-600 mb-5">
                {preview.subcategoryCount > 0 || preview.expenseCount > 0 ? (
                  <>
                    This will delete{' '}
                    {preview.subcategoryCount > 0 && (
                      <><strong>{preview.subcategoryCount} subcategor{preview.subcategoryCount === 1 ? 'y' : 'ies'}</strong> and </>
                    )}
                    <strong>{preview.expenseCount} expense{preview.expenseCount === 1 ? '' : 's'}</strong>
                    {' '}totaling <strong>{formatEurCents(preview.totalAmount)}</strong>. Are you sure?
                  </>
                ) : (
                  'Delete this empty category?'
                )}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <button onClick={() => setPendingDelete(false)} className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900">
                Cancel
              </button>
              <button
                onClick={() => deleteMut.mutate({ id: node.cat.id, snapshotId })}
                disabled={deleteMut.isLoading || previewQuery.isLoading || previewQuery.isError}
                className="bg-red-600 text-white px-4 py-1.5 rounded text-sm font-medium hover:bg-red-700 disabled:opacity-50"
              >
                {deleteMut.isLoading ? 'Deleting…' : 'Delete'}
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

  const allCategories = useMemo(() => {
    const byId = new Map<number, Category>();
    // Local entries first; prop (server) entries overwrite so server-normalised data always wins
    for (const c of localCategories) byId.set(c.id, c);
    for (const c of categories) byId.set(c.id, c);
    return Array.from(byId.values());
  }, [categories, localCategories]);

  const totals = useMemo(() => sumTree(allCategories, expenses), [allCategories, expenses]);

  const tree = useMemo(() => buildTree(allCategories, expenses), [allCategories, expenses]);

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
      <h2 className="text-lg font-semibold mb-3">Expenses</h2>
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        {allCategories.length === 0 && expenses.length === 0 && !editMode ? (
          <div className="py-8 text-center text-gray-400 text-sm">
            No expenses yet — switch to edit mode to start adding.
          </div>
        ) : (
          <>
            {tree.length === 0 && editMode && (
              <div className="py-4 text-center text-gray-400 text-sm">
                No categories yet — add one below.
              </div>
            )}

            {tree.map((node) => (
              <CategoryNodeRow
                key={node.cat.id}
                node={node}
                depth={0}
                snapshotId={snapshotId}
                allCategories={allCategories}
                totals={totals}
                editMode={editMode}
                onUpdate={onUpdate}
                onCategoriesUpdate={handleCategoriesUpdate}
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
                    placeholder="New category name"
                  />
                  <button
                    onClick={() => createCatMut.mutate({ snapshotId, name: topCatName.trim() })}
                    disabled={createCatMut.isLoading}
                    className="text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 disabled:opacity-50"
                  >
                    Add
                  </button>
                  <button
                    onClick={() => { setAddingTopCat(false); setTopCatName(''); }}
                    className="text-xs text-gray-500 hover:text-gray-700"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setAddingTopCat(true)}
                  className="w-full text-left py-2 px-3 text-sm text-blue-600 hover:text-blue-800 hover:bg-gray-50 border-t border-gray-200"
                >
                  + New Category
                </button>
              )
            )}

            {/* Total row */}
            {(allCategories.length > 0 || expenses.length > 0) && (
              <div className="flex justify-between items-center px-3 py-2 border-t border-gray-300 bg-gray-50">
                <span className="text-sm font-semibold text-gray-700">Total Expenses</span>
                <span className="text-sm font-semibold tabular-nums">{formatEurCents(totalExpenses)}</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
