import { useState } from 'react';
import { trpc } from '../../lib/trpc';
import { useToast } from '../../lib/toast';
import { centsToEuroStr, eurosToCents, sanitizeEuroInput } from '../../lib/currency';
import { getIncomeCategories } from '../../lib/income-autocomplete';
import { RecurrenceControl, RecurrenceMarker, CarriedHint, type Recurrence } from './RecurrenceControl';
import { ReorderButtons } from './ReorderButtons';
import { t } from '../../lib/strings';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { Figure } from '../ui/Figure';
import { IconButton } from '../ui/IconButton';
import { IconPlus, IconPencil, IconTrash, IconCheck, IconX } from '../ui/icons';

interface Income {
  id: number;
  name: string;
  amount: number;
  category: string;
  recurrence: Recurrence;
  carried_amount: number | null;
}

interface Props {
  snapshotId: number;
  incomes: Income[];
  editMode: boolean;
  onUpdate: () => void;
}

interface RowEdit {
  name: string;
  amount: string;
  category: string;
  recurrence: Recurrence;
}

const BLANK_EDIT: RowEdit = { name: '', amount: '0', category: '', recurrence: 'none' };

export function IncomeSection({ snapshotId, incomes, editMode, onUpdate }: Props) {
  const { showToast } = useToast();
  const [editingId, setEditingId] = useState<number | 'new' | null>(null);
  const [row, setRow] = useState<RowEdit>(BLANK_EDIT);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);

  const datalistId = `income-cats-${snapshotId}`;
  const autocomplete = getIncomeCategories(incomes);

  const upsert = trpc.incomes.upsert.useMutation({
    onSuccess: () => { onUpdate(); setEditingId(null); },
    onError: (err) => showToast(err.message),
  });

  const remove = trpc.incomes.delete.useMutation({
    onSuccess: () => { onUpdate(); setPendingDeleteId(null); },
    onError: (err) => showToast(err.message),
  });

  const reorder = trpc.incomes.reorder.useMutation({
    onSuccess: () => onUpdate(),
    onError: (err) => showToast(err.message),
  });

  function move(index: number, dir: 'up' | 'down') {
    const target = dir === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= incomes.length) return;
    const orderedIds = incomes.map((i) => i.id);
    [orderedIds[index], orderedIds[target]] = [orderedIds[target], orderedIds[index]];
    reorder.mutate({ snapshotId, orderedIds });
  }

  function startEdit(inc: Income) {
    setEditingId(inc.id);
    setRow({
      name: inc.name,
      amount: centsToEuroStr(inc.amount),
      category: inc.category,
      recurrence: inc.recurrence,
    });
  }

  function saveRow(id?: number) {
    const amountCents = eurosToCents(row.amount);
    if (amountCents === null) {
      showToast(t.invalidAmount);
      return;
    }
    upsert.mutate({
      ...(id !== undefined ? { id } : {}),
      snapshotId,
      name: row.name,
      amount: amountCents,
      category: row.category,
      recurrence: row.recurrence,
    });
  }

  function field(key: keyof RowEdit) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setRow((r) => ({ ...r, [key]: e.target.value }));
  }

  // Currency inputs only ever hold an integer-euro string (hard-block decimals, truncate pasted fractions).
  function currencyField(key: keyof RowEdit) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setRow((r) => ({ ...r, [key]: sanitizeEuroInput(e.target.value) }));
  }

  function onKey(save: () => void) {
    return (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') save();
      if (e.key === 'Escape') setEditingId(null);
    };
  }

  const th = 'px-5 py-3 text-sm font-medium text-ink-muted';
  const td = 'px-5 py-3.5';

  function renderEditRow(id?: number, carriedAmount: number | null = null) {
    const save = () => saveRow(id);
    return (
      <tr key={id ?? 'new'} className="border-b border-rule bg-accent-wash">
        <td className="px-3 py-2">
          <input className="field" value={row.name} onChange={field('name')} onKeyDown={onKey(save)} autoFocus placeholder={t.incomeName} />
        </td>
        <td className="px-3 py-2">
          <div className="flex flex-col items-end gap-1">
            <input type="number" step="1" min="0" className="field text-right" value={row.amount} onChange={currencyField('amount')} onKeyDown={onKey(save)} aria-label={t.amount} />
            <CarriedHint recurrence={row.recurrence} carriedAmount={carriedAmount} />
          </div>
        </td>
        <td className="px-3 py-2">
          <input className="field" list={datalistId} value={row.category} onChange={field('category')} onKeyDown={onKey(save)} placeholder={t.category} />
        </td>
        <td className="px-3 py-2">
          <RecurrenceControl
            value={row.recurrence}
            onChange={(v) => setRow((r) => ({ ...r, recurrence: v }))}
            showLabel={false}
            className="justify-center"
          />
        </td>
        <td className="px-3 py-2 whitespace-nowrap text-right">
          <IconButton onClick={save} disabled={upsert.isLoading} tone="accent" title={t.confirm} aria-label={t.confirm}>
            <IconCheck className="w-4 h-4" />
          </IconButton>
          <IconButton onClick={() => setEditingId(null)} tone="muted" title={t.cancel} aria-label={t.cancel}>
            <IconX className="w-4 h-4" />
          </IconButton>
        </td>
      </tr>
    );
  }

  const total = incomes.reduce((sum, i) => sum + i.amount, 0);

  return (
    <section>
      <datalist id={datalistId}>
        {autocomplete.map((cat) => (
          <option key={cat} value={cat} />
        ))}
      </datalist>

      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-xl font-bold text-ink">{t.income}</h2>
        {editMode && editingId !== 'new' && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => { setRow(BLANK_EDIT); setEditingId('new'); }}
          >
            <IconPlus />
            {t.addIncome}
          </Button>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-base">
            <thead>
              <tr className="border-b border-rule text-left">
                <th className={th}>{t.name}</th>
                <th className={`${th} text-right`}>{t.amount}</th>
                {editMode && (
                  <>
                    <th className={th}>{t.category}</th>
                    <th className={`${th} text-center`}>{t.recurring}</th>
                    <th className={`${th} w-24`} />
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {incomes.map((inc, index) =>
                editingId === inc.id ? (
                  renderEditRow(inc.id, inc.carried_amount)
                ) : (
                  <tr key={inc.id} className="border-b border-rule last:border-0 hover:bg-paper">
                    <td className={td}>
                      {/* Read-only rows fold category and recurrence under the name to stay narrow. */}
                      <span className="flex items-center gap-2 text-ink">
                        {inc.name}
                        {!editMode && <RecurrenceMarker recurrence={inc.recurrence} />}
                      </span>
                      {!editMode && inc.category && <span className="block text-sm text-ink-muted">{inc.category}</span>}
                    </td>
                    <td className={`${td} text-right`}>
                      <div className="flex flex-col items-end">
                        <Figure cents={inc.amount} />
                        <CarriedHint recurrence={inc.recurrence} carriedAmount={inc.carried_amount} />
                      </div>
                    </td>
                    {editMode && (
                      <td className={`${td} text-ink-muted`}>{inc.category}</td>
                    )}
                    {editMode && (
                      <td className={`${td} text-center`}>
                        <RecurrenceMarker recurrence={inc.recurrence} emptyDash />
                      </td>
                    )}
                    {editMode && (
                      <td className={`${td} whitespace-nowrap text-right`}>
                        <ReorderButtons
                          canMoveUp={index > 0}
                          canMoveDown={index < incomes.length - 1}
                          pending={reorder.isLoading}
                          onMoveUp={() => move(index, 'up')}
                          onMoveDown={() => move(index, 'down')}
                        />
                        <IconButton onClick={() => startEdit(inc)} tone="accent" title={t.edit} aria-label={t.edit}>
                          <IconPencil className="w-4 h-4" />
                        </IconButton>
                        <IconButton onClick={() => setPendingDeleteId(inc.id)} tone="loss" title={t.delete} aria-label={t.delete}>
                          <IconTrash className="w-4 h-4" />
                        </IconButton>
                      </td>
                    )}
                  </tr>
                )
              )}
              {editingId === 'new' && renderEditRow()}
            </tbody>
            {(incomes.length > 0 || editingId === 'new') && (
              <tfoot>
                <tr className="border-t border-rule font-semibold">
                  <td className={td}>{t.total}</td>
                  <td className={`${td} text-right`}>
                    <Figure cents={total} />
                  </td>
                  {editMode && <td colSpan={3} />}
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {incomes.length === 0 && editingId !== 'new' && (
          <div className="px-5 py-10 text-center text-base text-ink-muted">
            {editMode ? t.noIncomeEdit : t.noIncomeView}
          </div>
        )}
      </div>

      <Modal
        open={pendingDeleteId !== null}
        onClose={() => setPendingDeleteId(null)}
        title={t.deleteIncomeTitle}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingDeleteId(null)} disabled={remove.isLoading}>
              {t.cancel}
            </Button>
            <Button
              variant="danger"
              onClick={() => pendingDeleteId !== null && remove.mutate({ id: pendingDeleteId, snapshotId })}
              disabled={remove.isLoading}
            >
              {remove.isLoading ? t.deleting : t.delete}
            </Button>
          </>
        }
      >
        {t.deleteEntryBody}
      </Modal>
    </section>
  );
}
