import { useState, useMemo, useEffect } from 'react';
import { trpc } from '../../lib/trpc';
import { useToast } from '../../lib/toast';
import {
  formatEurCents,
  centsToEuroStr,
  eurosToCents,
  sanitizeEuroInput,
  sanitizeSignedEuroInput,
  signedEurosToCents,
  applyEuroAdjustment,
} from '../../lib/currency';
import { sumTree } from '../../lib/sum-tree';
import { cn } from '../../lib/cn';
import { CategoryPicker } from './CategoryPicker';
import { ReorderButtons } from './ReorderButtons';
import { t } from '../../lib/strings';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { Figure } from '../ui/Figure';
import { IconButton } from '../ui/IconButton';
import { IconChevron, IconPlus } from '../ui/icons';

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

// Small text-action buttons shared by the tree's dense rows.
const actAccent = 'text-xs text-accent hover:text-accent-hover px-1 disabled:opacity-50';
const actMuted = 'text-xs text-ink-muted hover:text-ink px-1 disabled:opacity-50';
const actLoss = 'text-xs text-loss hover:text-loss-hover px-1 disabled:opacity-50';

// Manual order is the single source of truth: categories and expenses are
// ordered by their stored `position` within each sibling group (id tiebreak).
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
  // Signed adjustment composed inside the edit form. Folded into `amount`
  // locally; only persisted when Save is clicked.
  const [adjust, setAdjust] = useState('');

  // Row-level quick-adjust: an inline accumulator that saves each fold straight
  // to the server. `baseCents` mirrors the last saved amount during the session.
  const [adjusting, setAdjusting] = useState(false);
  const [delta, setDelta] = useState('');
  const [baseCents, setBaseCents] = useState(expense.amount);

  const upsertMut = trpc.expenses.upsert.useMutation({
    onSuccess: () => { onUpdate(); setEditing(false); },
    onError: (err) => showToast(err.message),
  });

  const deleteMut = trpc.expenses.delete.useMutation({
    onSuccess: onUpdate,
    onError: (err) => showToast(err.message),
  });

  const quickAdjustMut = trpc.expenses.upsert.useMutation({
    onSuccess: (saved) => { setBaseCents(saved.amount); setDelta(''); onUpdate(); },
    onError: (err) => showToast(err.message),
  });

  // ── Edit-form adjustment (folds locally into `amount`) ──
  const formDelta = signedEurosToCents(adjust);
  const formBase = eurosToCents(amount) ?? 0;
  const formActive = formDelta !== null && formDelta !== 0;
  const formNext = formActive ? applyEuroAdjustment(formBase, adjust)! : formBase;

  function foldAdjust() {
    if (!formActive) return;
    setAmount(centsToEuroStr(formNext));
    setAdjust('');
  }

  function handleSave() {
    // Flush any un-applied adjustment so a typed delta is never silently lost.
    const base = eurosToCents(amount);
    const finalCents = formDelta !== null ? Math.max(0, (base ?? 0) + formDelta) : base;
    if (finalCents === null || finalCents < 0) { showToast(t.amountNonNegative); return; }
    upsertMut.mutate({
      id: expense.id,
      snapshotId,
      name: name.trim(),
      amount: finalCents,
      categoryId,
      recurring,
    });
  }

  // ── Row-level quick-adjust (persists each fold) ──
  const quickDelta = signedEurosToCents(delta);
  const quickActive = quickDelta !== null && quickDelta !== 0;
  const quickNext = quickActive ? applyEuroAdjustment(baseCents, delta)! : baseCents;

  function openQuickAdjust() {
    setBaseCents(expense.amount);
    setDelta('');
    setAdjusting(true);
  }

  // Persist the pending fold, then run onSaved (used to close after "done").
  function saveQuickFold(onSaved?: () => void) {
    if (quickAdjustMut.isLoading) return;
    if (!quickActive) { onSaved?.(); return; }
    quickAdjustMut.mutate(
      {
        id: expense.id,
        snapshotId,
        name: expense.name,
        amount: quickNext,
        categoryId: expense.category_id,
        recurring: expense.recurring === 1,
      },
      onSaved ? { onSuccess: onSaved } : undefined
    );
  }

  if (editing) {
    return (
      <div className="flex items-stretch border-b border-rule bg-accent-wash pl-2">
        <Indent depth={depth + 1} />
        <div className="flex min-w-0 flex-1 flex-col gap-2 py-2 pr-3">
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditing(false); }}
              className="field flex-1"
              placeholder={t.expenseName}
            />
            <input
              type="number"
              min="0"
              step="1"
              value={amount}
              onChange={(e) => setAmount(sanitizeEuroInput(e.target.value))}
              className="field w-28 text-right"
              placeholder="0"
              aria-label={t.amount}
            />
          </div>
          {/* Signed adjustment — fold a delta into the amount above */}
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-ink-muted">{t.adjust}</span>
            <input
              type="text"
              inputMode="numeric"
              value={adjust}
              onChange={(e) => setAdjust(sanitizeSignedEuroInput(e.target.value))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); foldAdjust(); }
                if (e.key === 'Escape') setEditing(false);
              }}
              className="field w-24 text-right"
              placeholder={t.adjustPlaceholder}
            />
            <button
              type="button"
              onClick={foldAdjust}
              disabled={!formActive}
              className={actAccent}
            >
              {t.adjustApply}
            </button>
            {formActive && (
              <span className="figure text-xs text-ink-muted">
                {formatEurCents(formBase)} → {formatEurCents(formNext)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-ink-muted">{t.categoryLabel}</span>
            <CategoryPicker
              snapshotId={snapshotId}
              categories={categories}
              value={categoryId}
              onChange={setCategoryId}
              onCategoriesUpdate={onCategoriesUpdate}
            />
          </div>
          <div className="flex items-center gap-4">
            <label className="flex cursor-pointer items-center gap-1.5 text-sm text-ink-muted">
              <input
                type="checkbox"
                checked={recurring}
                onChange={(e) => setRecurring(e.target.checked)}
                className="h-4 w-4 rounded accent-[var(--accent)]"
              />
              {t.recurring}
            </label>
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={handleSave}
                disabled={upsertMut.isLoading}
                className="rounded-mark bg-accent px-3 py-1 text-xs font-medium text-onFill transition-colors hover:bg-accent-hover disabled:opacity-50"
              >
                {upsertMut.isLoading ? t.saving : t.save}
              </button>
              <button onClick={() => setEditing(false)} className={actMuted}>
                {t.cancel}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-stretch border-b border-rule pl-2 last:border-0 hover:bg-paper">
      <Indent depth={depth + 1} />
      <div className="flex min-w-0 flex-1 items-center justify-between py-1.5 pr-3">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm text-ink">{expense.name}</span>
          {expense.recurring === 1 && (
            <span className="shrink-0 text-xs text-ink-muted" title={t.recurring}>↻</span>
          )}
        </span>
        {editMode && adjusting ? (
          <span className="ml-4 flex shrink-0 items-center gap-2">
            <input
              autoFocus
              type="text"
              inputMode="numeric"
              value={delta}
              onChange={(e) => setDelta(sanitizeSignedEuroInput(e.target.value))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); saveQuickFold(); }
                if (e.key === 'Escape') setAdjusting(false);
              }}
              className="field w-20 text-right"
              placeholder={t.adjustPlaceholder}
              aria-label={t.adjust}
            />
            {quickActive ? (
              <span className="figure text-sm text-ink-muted">
                {formatEurCents(baseCents)} →{' '}
                <span className="font-medium text-ink">{formatEurCents(quickNext)}</span>
              </span>
            ) : (
              <span className="figure text-sm text-ink">{formatEurCents(baseCents)}</span>
            )}
            <button
              type="button"
              onClick={() => saveQuickFold()}
              disabled={!quickActive || quickAdjustMut.isLoading}
              title={t.adjustApply}
              className="rounded-mark bg-accent px-2 py-1 text-xs font-medium text-onFill transition-colors hover:bg-accent-hover disabled:opacity-40"
            >
              {t.adjustApply}
            </button>
            <button
              type="button"
              onClick={() => saveQuickFold(() => setAdjusting(false))}
              disabled={quickAdjustMut.isLoading}
              className={actMuted}
            >
              {t.done}
            </button>
          </span>
        ) : (
          <span className="ml-4 flex shrink-0 items-center gap-3">
            <Figure cents={expense.amount} />
            {editMode && (
              <>
                <ReorderButtons
                  canMoveUp={index > 0}
                  canMoveDown={index < siblingIds.length - 1}
                  pending={expensesPending}
                  onMoveUp={() => onMoveExpense(expense.category_id, siblingIds, index, 'up')}
                  onMoveDown={() => onMoveExpense(expense.category_id, siblingIds, index, 'down')}
                />
                <button
                  onClick={openQuickAdjust}
                  title={t.adjust}
                  aria-label={t.adjust}
                  className="px-1 text-sm font-semibold leading-none text-accent hover:text-accent-hover"
                >
                  ±
                </button>
                <button onClick={() => setEditing(true)} className={actAccent}>
                  {t.edit}
                </button>
                <button
                  onClick={() => deleteMut.mutate({ id: expense.id, snapshotId })}
                  disabled={deleteMut.isLoading}
                  className={actLoss}
                >
                  {deleteMut.isLoading ? '…' : t.delete}
                </button>
              </>
            )}
          </span>
        )}
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
    <div className="flex items-stretch border-b border-rule bg-accent-wash pl-2">
      <Indent depth={depth + 1} />
      <div className="flex min-w-0 flex-1 flex-col gap-2 py-2 pr-3">
        <div className="flex items-center gap-2">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onClose(); }}
            className="field flex-1"
            placeholder={t.expenseName}
          />
          <input
            type="number"
            min="0"
            step="1"
            value={amount}
            onChange={(e) => setAmount(sanitizeEuroInput(e.target.value))}
            className="field w-28 text-right"
            placeholder="0"
            aria-label={t.amount}
          />
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-ink-muted">{t.categoryLabel}</span>
          <CategoryPicker
            snapshotId={snapshotId}
            categories={categories}
            value={categoryId}
            onChange={setCategoryId}
            onCategoriesUpdate={onCategoriesUpdate}
          />
        </div>
        <div className="flex items-center gap-4">
          <label className="flex cursor-pointer items-center gap-1.5 text-sm text-ink-muted">
            <input
              type="checkbox"
              checked={recurring}
              onChange={(e) => setRecurring(e.target.checked)}
              className="h-4 w-4 rounded accent-[var(--accent)]"
            />
            {t.recurring}
          </label>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={upsertMut.isLoading}
              className="rounded-mark bg-accent px-3 py-1 text-xs font-medium text-onFill transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              {upsertMut.isLoading ? t.saving : t.add}
            </button>
            <button onClick={onClose} className={actMuted}>{t.cancel}</button>
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
      <div
        onClick={() => { if (hasContent && !renaming) onToggleCollapse(node.cat.id); }}
        className={cn(
          'flex items-stretch border-b border-rule bg-paper pl-2',
          hasContent && !renaming && 'cursor-pointer hover:bg-rule'
        )}
      >
        <Indent depth={depth} />
        <div className="flex min-w-0 flex-1 items-center justify-between py-1.5 pr-3">
          <span className="flex min-w-0 items-center">
            <span className="flex w-5 shrink-0 items-center">
              {hasContent && (
                <button
                  onClick={(e) => { e.stopPropagation(); onToggleCollapse(node.cat.id); }}
                  aria-label={collapsed ? t.expandCategory : t.collapseCategory}
                  className="flex items-center text-ink-muted hover:text-ink"
                >
                  <IconChevron expanded={!collapsed} className="w-3.5 h-3.5" />
                </button>
              )}
            </span>

            {renaming ? (
              <span className="flex flex-1 items-center gap-2" onClick={(e) => e.stopPropagation()}>
                <input
                  autoFocus
                  value={renameName}
                  onChange={(e) => setRenameName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') updateMut.mutate({ id: node.cat.id, snapshotId, name: renameName.trim() });
                    if (e.key === 'Escape') setRenaming(false);
                  }}
                  className="field max-w-xs flex-1"
                />
                <button
                  onClick={() => updateMut.mutate({ id: node.cat.id, snapshotId, name: renameName.trim() })}
                  disabled={updateMut.isLoading}
                  className={actAccent}
                >
                  {t.save}
                </button>
                <button onClick={() => setRenaming(false)} className={actMuted}>{t.cancel}</button>
              </span>
            ) : (
              <span className="flex min-w-0 items-center gap-2">
                <span className={cn('truncate text-sm font-medium', hasContent ? 'text-ink' : 'text-ink-muted')}>
                  {node.cat.name}
                </span>
                {!hasContent && <span className="shrink-0 text-xs font-normal text-ink-muted">{t.emptyCategory}</span>}
              </span>
            )}
          </span>

          <span className="ml-4 flex shrink-0 items-center gap-3">
            <span className="figure text-sm font-medium text-ink-muted">
              {formatEurCents(subtotal)}
            </span>
            {editMode && !renaming && (
              <span className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                <ReorderButtons
                  canMoveUp={index > 0}
                  canMoveDown={index < siblingIds.length - 1}
                  pending={categoriesPending}
                  onMoveUp={() => onMoveCategory(parentId, siblingIds, index, 'up')}
                  onMoveDown={() => onMoveCategory(parentId, siblingIds, index, 'down')}
                />
                <button onClick={() => setAddingExpense(true)} title={t.addExpense} className={actAccent}>
                  {t.addExpenseShort}
                </button>
                <button onClick={() => setAddingSubcat(true)} title={t.addSubcategory} className={actAccent}>
                  {t.addSubcategoryShort}
                </button>
                <button onClick={() => { setRenameName(node.cat.name); setRenaming(true); }} className={actMuted}>
                  {t.rename}
                </button>
                <button onClick={() => setPendingDelete(true)} className={actLoss}>
                  {t.delete}
                </button>
              </span>
            )}
          </span>
        </div>
      </div>

      {/* Add subcategory row */}
      {addingSubcat && (
        <div className="flex items-stretch border-b border-rule bg-accent-wash pl-2">
          <Indent depth={depth + 1} />
          <div className="flex min-w-0 flex-1 items-center gap-2 py-2 pr-3">
            <input
              autoFocus
              value={subcatName}
              onChange={(e) => setSubcatName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') createSubcatMut.mutate({ snapshotId, name: subcatName.trim(), parentId: node.cat.id });
                if (e.key === 'Escape') { setAddingSubcat(false); setSubcatName(''); }
              }}
              className="field max-w-xs flex-1"
              placeholder={t.subcategoryName}
            />
            <button
              onClick={() => createSubcatMut.mutate({ snapshotId, name: subcatName.trim(), parentId: node.cat.id })}
              disabled={createSubcatMut.isLoading}
              className="rounded-mark bg-accent px-2 py-1 text-xs font-medium text-onFill transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              {t.add}
            </button>
            <button onClick={() => { setAddingSubcat(false); setSubcatName(''); }} className={actMuted}>
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
      <Modal
        open={pendingDelete}
        onClose={() => setPendingDelete(false)}
        title={t.deleteCategoryTitle}
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingDelete(false)}>
              {t.cancel}
            </Button>
            <Button
              variant="danger"
              onClick={() => deleteMut.mutate({ id: node.cat.id, snapshotId })}
              disabled={deleteMut.isLoading || previewQuery.isLoading || previewQuery.isError}
            >
              {deleteMut.isLoading ? t.deleting : t.delete}
            </Button>
          </>
        }
      >
        {previewQuery.isLoading ? (
          <span>{t.loading}</span>
        ) : previewQuery.isError ? (
          <span className="text-loss">{t.deletePreviewError}</span>
        ) : preview ? (
          <span>
            {preview.subcategoryCount > 0 || preview.expenseCount > 0
              ? t.deleteCategoryBody(
                  preview.subcategoryCount,
                  preview.expenseCount,
                  formatEurCents(preview.totalAmount)
                )
              : t.deleteEmptyCategory}
          </span>
        ) : null}
      </Modal>
    </>
  );
}

// ─── Top-level component ──────────────────────────────────────────────────────

export function ExpenseTree({ snapshotId, expenses, categories, editMode, onUpdate }: Props) {
  const [localCategories, setLocalCategories] = useState<Category[]>([]);

  // Server categories are authoritative & complete; once a refetch lands,
  // the local optimistic cache is redundant.
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
    for (const c of localCategories) byId.set(c.id, c);
    for (const c of categories) byId.set(c.id, c);
    return Array.from(byId.values());
  }, [categories, localCategories]);

  const totals = useMemo(() => sumTree(allCategories, expenses), [allCategories, expenses]);

  const tree = useMemo(() => buildTree(allCategories, expenses), [allCategories, expenses]);

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
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold text-ink">{t.expenses}</h2>
        {collapsibleIds.length > 0 && (
          <button onClick={toggleAll} className="text-xs text-ink-muted hover:text-ink">
            {allCollapsed ? t.expandAll : t.collapseAll}
          </button>
        )}
      </div>
      <div className="card overflow-hidden">
        {allCategories.length === 0 && expenses.length === 0 && !editMode ? (
          <div className="py-8 text-center text-sm text-ink-muted">{t.noExpensesView}</div>
        ) : (
          <>
            {tree.length === 0 && editMode && (
              <div className="py-4 text-center text-sm text-ink-muted">{t.noCategories}</div>
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
                <div className="flex items-center gap-2 border-t border-rule bg-accent-wash p-3">
                  <input
                    autoFocus
                    value={topCatName}
                    onChange={(e) => setTopCatName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') createCatMut.mutate({ snapshotId, name: topCatName.trim() });
                      if (e.key === 'Escape') { setAddingTopCat(false); setTopCatName(''); }
                    }}
                    className="field max-w-xs flex-1"
                    placeholder={t.newCategoryName}
                  />
                  <button
                    onClick={() => createCatMut.mutate({ snapshotId, name: topCatName.trim() })}
                    disabled={createCatMut.isLoading}
                    className="rounded-mark bg-accent px-3 py-1 text-xs font-medium text-onFill transition-colors hover:bg-accent-hover disabled:opacity-50"
                  >
                    {t.add}
                  </button>
                  <button
                    onClick={() => { setAddingTopCat(false); setTopCatName(''); }}
                    className={actMuted}
                  >
                    {t.cancel}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setAddingTopCat(true)}
                  className="flex w-full items-center gap-1.5 border-t border-rule px-3 py-2.5 text-left text-sm text-accent transition-colors hover:bg-paper hover:text-accent-hover"
                >
                  <IconPlus className="w-4 h-4" />
                  {t.newCategory}
                </button>
              )
            )}

            {/* Grand total — sealed by the accountant's double rule */}
            {(allCategories.length > 0 || expenses.length > 0) && (
              <div className="flex items-center justify-between border-t-[3px] border-double border-rule-ink bg-paper px-3 py-2.5">
                <span className="text-sm font-semibold text-ink">{t.totalExpenses}</span>
                <Figure cents={totalExpenses} className="font-semibold" />
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
