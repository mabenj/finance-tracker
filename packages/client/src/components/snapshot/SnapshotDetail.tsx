import { useState } from 'react';
import { trpc } from '../../lib/trpc';
import { useToast } from '../../lib/toast';
import { formatEurCents } from '../../lib/currency';
import { NetWorthComparison } from '../visualizations/NetWorthComparison';
import { AccountsSection } from './AccountsSection';
import { IncomeSection } from './IncomeSection';
import { CategoryPicker } from './CategoryPicker';

interface Account {
  id: number;
  name: string;
  type: string;
  category: string;
  balance: number;
  total_paid: number | null;
}

interface Income {
  id: number;
  name: string;
  amount: number;
  category: string;
  recurring: number;
}

interface Category {
  id: number;
  name: string;
  parent_id: number | null;
}

interface Props {
  snapshot: {
    id: number;
    accounts: Account[];
    incomes: Income[];
    categories: Category[];
    previousSnapshot: { accounts: Account[] } | null;
  };
  editMode: boolean;
  onUpdate: () => void;
}

// Builds a nested display from the flat category list for the management section
interface CategoryNode {
  cat: Category;
  children: CategoryNode[];
}

function buildTree(categories: Category[]): CategoryNode[] {
  const map = new Map<number, CategoryNode>();
  for (const cat of categories) map.set(cat.id, { cat, children: [] });
  const roots: CategoryNode[] = [];
  for (const node of map.values()) {
    if (node.cat.parent_id === null) {
      roots.push(node);
    } else {
      map.get(node.cat.parent_id)?.children.push(node);
    }
  }
  return roots;
}

interface CategoryNodeRowProps {
  node: CategoryNode;
  depth: number;
  snapshotId: number;
  editMode: boolean;
  onUpdate: () => void;
}

function CategoryNodeRow({ node, depth, snapshotId, editMode, onUpdate }: CategoryNodeRowProps) {
  const { showToast } = useToast();
  const [renaming, setRenaming] = useState(false);
  const [renameName, setRenameName] = useState(node.cat.name);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [preview, setPreview] = useState<{ subcategoryCount: number; expenseCount: number; totalAmount: number } | null>(null);

  const updateMut = trpc.categories.update.useMutation({
    onSuccess: () => { onUpdate(); setRenaming(false); },
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

  function submitRename() {
    if (!renameName.trim()) return;
    updateMut.mutate({ id: node.cat.id, snapshotId, name: renameName.trim() });
  }

  const indent = depth * 20;

  return (
    <>
      <div
        className="flex items-center justify-between py-1.5 px-3 hover:bg-gray-50 border-b border-gray-100 last:border-0"
        style={{ paddingLeft: `${12 + indent}px` }}
      >
        {renaming ? (
          <span className="flex items-center gap-2 flex-1">
            <input
              autoFocus
              value={renameName}
              onChange={(e) => setRenameName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitRename();
                if (e.key === 'Escape') setRenaming(false);
              }}
              className="border border-gray-300 rounded px-2 py-0.5 text-sm flex-1 max-w-xs"
            />
            <button
              onClick={submitRename}
              disabled={updateMut.isLoading}
              className="text-xs text-green-700 hover:text-green-900 font-medium"
            >
              Save
            </button>
            <button onClick={() => setRenaming(false)} className="text-xs text-gray-400 hover:text-gray-600">
              Cancel
            </button>
          </span>
        ) : (
          <span className="text-sm text-gray-700">
            {depth > 0 && <span className="text-gray-300 mr-1">{'─'.repeat(depth)}</span>}
            {node.cat.name}
          </span>
        )}

        {editMode && !renaming && (
          <span className="flex gap-2 ml-4">
            <button
              onClick={() => { setRenameName(node.cat.name); setRenaming(true); }}
              className="text-xs text-blue-500 hover:text-blue-700"
            >
              Rename
            </button>
            <button
              onClick={() => setPendingDelete(true)}
              className="text-xs text-red-400 hover:text-red-600"
            >
              Delete
            </button>
          </span>
        )}
      </div>

      {node.children.map((child) => (
        <CategoryNodeRow
          key={child.cat.id}
          node={child}
          depth={depth + 1}
          snapshotId={snapshotId}
          editMode={editMode}
          onUpdate={onUpdate}
        />
      ))}

      {pendingDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-96">
            <h2 className="text-base font-semibold mb-2">Delete category?</h2>
            {previewQuery.isLoading ? (
              <p className="text-sm text-gray-500 mb-5">Loading…</p>
            ) : preview ? (
              <p className="text-sm text-gray-600 mb-5">
                {preview.subcategoryCount > 0 || preview.expenseCount > 0 ? (
                  <>
                    This will delete{' '}
                    {preview.subcategoryCount > 0 && (
                      <>
                        <strong>{preview.subcategoryCount} subcategor{preview.subcategoryCount === 1 ? 'y' : 'ies'}</strong>
                        {' '}and{' '}
                      </>
                    )}
                    <strong>{preview.expenseCount} expense{preview.expenseCount === 1 ? '' : 's'}</strong>
                    {' '}totaling <strong>{formatEurCents(preview.totalAmount)}</strong>
                    . Are you sure?
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
                disabled={deleteMut.isLoading || previewQuery.isLoading}
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

interface NewCatRowProps {
  snapshotId: number;
  categories: Category[];
  onUpdate: () => void;
  onCategoriesUpdate: (cat: Category) => void;
}

function NewCategoryRow({ snapshotId, categories, onUpdate, onCategoriesUpdate }: NewCatRowProps) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full text-left py-2 px-3 text-sm text-blue-600 hover:text-blue-800 hover:bg-gray-50 border-t border-gray-100"
      >
        + New Category
      </button>
    );
  }

  return (
    <div className="p-3 border-t border-gray-100 bg-blue-50">
      <CategoryPicker
        snapshotId={snapshotId}
        categories={categories}
        value={null}
        onChange={() => {/* category created via picker — onCategoriesUpdate handles state */}}
        onCategoriesUpdate={(cat) => { onCategoriesUpdate(cat); onUpdate(); }}
      />
      <p className="text-xs text-gray-500 mt-2">
        Use the picker above to create a new category at any level.
      </p>
      <div className="flex gap-2 mt-2">
        <button onClick={() => setOpen(false)} className="text-xs text-gray-500 hover:text-gray-700">
          Done
        </button>
      </div>
    </div>
  );
}

export function SnapshotDetail({ snapshot, editMode, onUpdate }: Props) {
  const [localCategories, setLocalCategories] = useState<Category[]>(snapshot.categories);

  // Keep local in sync when snapshot refreshes (e.g., after refetch)
  const mergedCategories = (() => {
    const byId = new Map<number, Category>();
    for (const c of snapshot.categories) byId.set(c.id, c);
    for (const c of localCategories) byId.set(c.id, c);
    return Array.from(byId.values());
  })();

  const tree = buildTree(mergedCategories);

  return (
    <div className="space-y-8">
      <NetWorthComparison
        accounts={snapshot.accounts}
        previousAccounts={snapshot.previousSnapshot?.accounts ?? null}
      />

      <AccountsSection
        snapshotId={snapshot.id}
        accounts={snapshot.accounts}
        editMode={editMode}
        onUpdate={onUpdate}
      />

      <IncomeSection
        snapshotId={snapshot.id}
        incomes={snapshot.incomes}
        editMode={editMode}
        onUpdate={onUpdate}
      />

      <div>
        <h2 className="text-lg font-semibold mb-3">Expense Categories</h2>
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          {mergedCategories.length === 0 && !editMode ? (
            <div className="py-8 text-center text-gray-400 text-sm">
              No expense categories yet — switch to edit mode to start adding.
            </div>
          ) : (
            <>
              {tree.map((node) => (
                <CategoryNodeRow
                  key={node.cat.id}
                  node={node}
                  depth={0}
                  snapshotId={snapshot.id}
                  editMode={editMode}
                  onUpdate={onUpdate}
                />
              ))}
              {mergedCategories.length === 0 && editMode && (
                <div className="py-4 text-center text-gray-400 text-sm">
                  No categories yet.
                </div>
              )}
              {editMode && (
                <NewCategoryRow
                  snapshotId={snapshot.id}
                  categories={mergedCategories}
                  onUpdate={onUpdate}
                  onCategoriesUpdate={(cat) =>
                    setLocalCategories((prev) => {
                      const byId = new Map(prev.map((c) => [c.id, c]));
                      byId.set(cat.id, cat);
                      return Array.from(byId.values());
                    })
                  }
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
