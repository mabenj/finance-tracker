import { createContext, useContext, useState } from 'react';
import { cn } from '../../lib/cn';
import { t } from '../../lib/strings';
import {
  applyEuroAdjustment, formatEurCents, sanitizeSignedEuroInput, signedEurosToCents,
} from '../../lib/currency';
import { categoryPath, itemsOf, type DraftItem, type Phase } from '../../lib/snapshot-draft';
import { Button } from '../ui/Button';
import { Figure } from '../ui/Figure';
import { Delta } from '../ui/Delta';
import { Badge } from '../ui/Badge';
import { IconButton } from '../ui/IconButton';
import { IconCheck, IconPencil, IconTrash } from '../ui/icons';
import { MoneyInput } from '../ui/MoneyInput';
import { RecurrenceControl, type Recurrence } from '../snapshot/RecurrenceControl';
import { CategorySelect } from './CategorySelect';
import type { DraftActions } from './useDraft';

/**
 * The row whose edit panel is open. Held above the row groups so a row that
 * moves (type or category change) keeps its panel open.
 */
export const EditingContext = createContext<{ editing: string | null; setEditing: (key: string | null) => void }>({
  editing: null,
  setEditing: () => {},
});

const GRID = 'grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 sm:grid-cols-[1fr_7rem_9rem_6rem_6.5rem]';

export function ColumnHeads() {
  return (
    <div className="hidden grid-cols-[1fr_7rem_9rem_6rem_6.5rem] gap-x-4 pb-1 text-xs font-medium uppercase tracking-wide text-ink-faint sm:grid">
      <span />
      <span className="text-right">{t.lastMonth}</span>
      <span className="text-right">{t.thisMonth}</span>
      <span className="text-right">{t.change}</span>
      <span />
    </div>
  );
}

const RECURRENCE_LABEL: Record<Recurrence, string> = {
  none: t.recurrenceNone,
  fixed: t.recurrenceFixed,
  variable: t.recurrenceVariable,
};

export function rowSubtitle(actions: DraftActions, item: DraftItem): string {
  if (item.phase === 'accounts') return item.category ?? '';
  const category = item.phase === 'incomes' ? item.category : categoryPath(actions.draft.categories, item.categoryId);
  return `${category || '—'} · ${RECURRENCE_LABEL[item.recurrence]}`;
}

/** Whether a rise in this row's amount is good news (drives the delta colour). */
const goodWhenUp = (item: DraftItem) => item.phase === 'incomes' || item.type === 'asset';

export function WizardRow({ actions, item }: { actions: DraftActions; item: DraftItem }) {
  const { editing, setEditing } = useContext(EditingContext);
  const open = editing === item.key;
  const [adjusting, setAdjusting] = useState(false);
  const delta = item.value !== null && item.prev !== null ? item.value - item.prev : null;
  const tracksPaid = item.phase === 'accounts' && item.type === 'liability' && item.totalPaid != null;
  const paidDelta = tracksPaid && item.prevTotalPaid != null ? item.totalPaid! - item.prevTotalPaid : null;

  const actionButtons = (
    <>
      {item.phase === 'expenses' && (
        <IconButton tone={adjusting ? 'accent' : 'muted'} onClick={() => setAdjusting(!adjusting)} aria-label={t.adjust} title={t.adjust}>
          <span className="flex h-5 w-5 items-center justify-center text-base font-semibold leading-none" aria-hidden="true">±</span>
        </IconButton>
      )}
      <IconButton tone={open ? 'accent' : 'muted'} onClick={() => setEditing(open ? null : item.key)} aria-label={t.editDetails} title={t.editDetails} aria-expanded={open}>
        <IconPencil />
      </IconButton>
      <IconButton tone="loss" onClick={() => actions.remove(item.key)} aria-label={t.delete} title={t.delete}>
        <IconTrash />
      </IconButton>
    </>
  );

  return (
    <div className={cn('border-b border-rule py-2.5 last:border-0', open && '-mx-3 rounded-card border-0 bg-paper px-3')}>
      <div className={GRID}>
        <div className="min-w-0">
          <div className="truncate font-medium text-ink">{item.name || '—'}</div>
          <div className="truncate text-sm text-ink-muted">{rowSubtitle(actions, item)}</div>
        </div>
        <div className="hidden text-right text-sm sm:block">
          {item.prev !== null ? <Figure cents={item.prev} muted /> : <Badge tone="accent">{t.newRowBadge}</Badge>}
        </div>
        <MoneyInput cents={item.value} onChange={(value) => actions.update(item.key, { value })} aria-label={item.name} />
        <div className="hidden text-right sm:block">
          {delta !== null && delta !== 0 && <Delta absolute={delta} toneValue={goodWhenUp(item) ? delta : -delta} />}
        </div>
        <div className="col-span-2 flex justify-end gap-0.5 sm:col-span-1">{actionButtons}</div>
      </div>

      {tracksPaid && (
        <div className={cn(GRID, 'mt-2')}>
          <div className="pl-4 text-sm text-ink-muted">{t.totalPaid}</div>
          <div className="hidden text-right text-sm sm:block">
            {item.prevTotalPaid != null ? <Figure cents={item.prevTotalPaid} muted /> : '—'}
          </div>
          <MoneyInput
            cents={item.totalPaid ?? null}
            onChange={(v) => actions.update(item.key, { totalPaid: v ?? 0 })}
            aria-label={`${item.name}: ${t.totalPaid}`}
            inputClassName="!py-1 !text-sm"
          />
          <div className="hidden text-right sm:block">{paidDelta !== null && paidDelta !== 0 && <Delta absolute={paidDelta} />}</div>
          <span className="hidden sm:block" />
        </div>
      )}

      {adjusting && <AdjustBar actions={actions} item={item} onClose={() => setAdjusting(false)} />}
      {open && <EditPanel actions={actions} item={item} onClose={() => setEditing(null)} />}
    </div>
  );
}

// The same signed accumulator as the snapshot page's expense rows: "+50" adds,
// "-20" subtracts, a bare number adds; applying folds it in and closes.
function AdjustBar({ actions, item, onClose }: { actions: DraftActions; item: DraftItem; onClose: () => void }) {
  const [delta, setDelta] = useState('');
  const base = item.value ?? 0;
  const parsed = signedEurosToCents(delta);
  const active = parsed !== null && parsed !== 0;
  const next = active ? applyEuroAdjustment(base, delta)! : base;

  function apply() {
    if (active) actions.update(item.key, { value: next });
    onClose();
  }

  return (
    <div className="mt-2 flex flex-wrap items-center justify-end gap-2 pl-4">
      <span className="text-sm text-ink-muted">{t.adjust}</span>
      <input
        autoFocus
        inputMode="numeric"
        className="field figure w-24 text-right"
        placeholder={t.adjustPlaceholder}
        aria-label={t.adjust}
        value={delta}
        onChange={(e) => setDelta(sanitizeSignedEuroInput(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); apply(); }
          if (e.key === 'Escape') onClose();
        }}
      />
      <span className="figure min-w-[9rem] text-right text-base text-ink-muted">
        {active ? (
          <>
            {formatEurCents(base)} → <span className="font-medium text-ink">{formatEurCents(next)}</span>
          </>
        ) : (
          formatEurCents(base)
        )}
      </span>
      <Button size="sm" onClick={apply} disabled={!active}>{t.adjustApply}</Button>
      <Button size="sm" variant="ghost" onClick={onClose}>{t.cancel}</Button>
    </div>
  );
}

// A captioned control. Groups of buttons can't sit inside a <label> (clicking
// the caption would press the first button), so `group` renders a plain div.
function Field({ label, children, className, group }: { label: string; children: React.ReactNode; className?: string; group?: boolean }) {
  const cls = cn('flex flex-col gap-1 text-sm text-ink-muted', className);
  return group ? (
    <div className={cls}>
      <span>{label}</span>
      {children}
    </div>
  ) : (
    <label className={cls}>
      {label}
      {children}
    </label>
  );
}

function TypeToggle({ value, onChange }: { value: 'asset' | 'liability'; onChange: (v: 'asset' | 'liability') => void }) {
  return (
    <div className="inline-flex w-fit overflow-hidden rounded-mark border border-rule-strong" role="group" aria-label={t.type}>
      {(['asset', 'liability'] as const).map((v) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={cn('px-3 py-1.5 text-sm font-medium transition-colors', value === v ? 'bg-accent text-onFill' : 'bg-sheet text-ink-muted hover:text-ink')}
        >
          {t.accountType[v]}
        </button>
      ))}
    </div>
  );
}

function EditPanel({ actions, item, onClose }: { actions: DraftActions; item: DraftItem; onClose: () => void }) {
  const set = (patch: Partial<DraftItem>) => actions.update(item.key, patch);
  const listId = `wizard-categories-${item.key}`;
  const knownCategories = (phase: Phase) =>
    [...new Set(itemsOf(actions.draft, phase).map((i) => i.category).filter((c): c is string => !!c))];

  const textCategory = (
    <Field label={t.category} className="w-44">
      <input className="field" list={listId} value={item.category ?? ''} onChange={(e) => set({ category: e.target.value })} />
      <datalist id={listId}>{knownCategories(item.phase).map((c) => <option key={c} value={c} />)}</datalist>
    </Field>
  );

  return (
    <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-rule pt-3">
      <Field label={t.name} className="min-w-[12rem] flex-1">
        <input className="field" value={item.name} onChange={(e) => set({ name: e.target.value })} />
      </Field>

      {item.phase === 'accounts' && (
        <>
          <Field label={t.type} group>
            <TypeToggle
              value={item.type ?? 'asset'}
              onChange={(type) => set({ type, totalPaid: type === 'asset' ? null : item.totalPaid })}
            />
          </Field>
          {textCategory}
          {item.type === 'liability' && (
            <label className="flex cursor-pointer items-center gap-1.5 pb-2 text-sm text-ink-muted">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[var(--accent)]"
                checked={item.totalPaid != null}
                onChange={(e) => set({ totalPaid: e.target.checked ? item.prevTotalPaid ?? 0 : null })}
              />
              {t.trackTotalPaid}
            </label>
          )}
        </>
      )}

      {item.phase === 'incomes' && textCategory}

      {item.phase === 'expenses' && (
        <Field label={t.category} className="w-64" group>
          <CategorySelect actions={actions} value={item.categoryId} onChange={(categoryId) => set({ categoryId })} />
        </Field>
      )}

      {item.phase !== 'accounts' && (
        <Field label={t.carriesToNextMonth} group>
          <RecurrenceControl className="min-h-[2.5rem]" value={item.recurrence} onChange={(recurrence) => set({ recurrence })} />
        </Field>
      )}

      <Button variant="secondary" size="sm" className="ml-auto" onClick={onClose}>
        <IconCheck />
        {t.done}
      </Button>
    </div>
  );
}
