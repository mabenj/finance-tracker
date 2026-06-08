import { useState } from 'react';
import { trpc } from '../../lib/trpc';
import { useToast } from '../../lib/toast';
import { formatEurCents } from '../../lib/currency';
import { getIncomeCategories } from '../../lib/income-autocomplete';

interface Income {
  id: number;
  name: string;
  amount: number;
  category: string;
  recurring: number;
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
  recurring: boolean;
}

const BLANK_EDIT: RowEdit = { name: '', amount: '0.00', category: '', recurring: false };

function centsToStr(cents: number) {
  return (cents / 100).toFixed(2);
}

function strToCents(val: string): number | null {
  const n = Number(val);
  if (isNaN(n) || !isFinite(n)) return null;
  return Math.round(n * 100);
}

function IconPencil() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
    </svg>
  );
}

function IconX() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
    </svg>
  );
}

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

  function startEdit(inc: Income) {
    setEditingId(inc.id);
    setRow({
      name: inc.name,
      amount: centsToStr(inc.amount),
      category: inc.category,
      recurring: inc.recurring === 1,
    });
  }

  function saveRow(id?: number) {
    const amountCents = strToCents(row.amount);
    if (amountCents === null) {
      showToast('Invalid amount — enter a number like 1234.56');
      return;
    }
    upsert.mutate({
      ...(id !== undefined ? { id } : {}),
      snapshotId,
      name: row.name,
      amount: amountCents,
      category: row.category,
      recurring: row.recurring,
    });
  }

  function field(key: keyof RowEdit) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setRow((r) => ({ ...r, [key]: e.target.value }));
  }

  function onKey(save: () => void) {
    return (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') save();
      if (e.key === 'Escape') setEditingId(null);
    };
  }

  const inputCls = 'border border-gray-300 rounded px-2 py-1 text-sm w-full';

  function renderEditRow(id?: number) {
    const save = () => saveRow(id);
    return (
      <tr key={id ?? 'new'} className="border-b border-blue-100 bg-blue-50">
        <td className="py-1 pr-2 pl-3">
          <input className={inputCls} value={row.name} onChange={field('name')} onKeyDown={onKey(save)} autoFocus placeholder="Income name" />
        </td>
        <td className="py-1 pr-2">
          <input
            type="number" step="0.01" min="0"
            className={`${inputCls} text-right`}
            value={row.amount}
            onChange={field('amount')}
            onKeyDown={onKey(save)}
          />
        </td>
        <td className="py-1 pr-2">
          <input
            className={inputCls}
            list={datalistId}
            value={row.category}
            onChange={field('category')}
            onKeyDown={onKey(save)}
            placeholder="Category"
          />
        </td>
        <td className="py-1 pr-2 text-center">
          <input
            type="checkbox"
            checked={row.recurring}
            onChange={(e) => setRow((r) => ({ ...r, recurring: e.target.checked }))}
            className="w-4 h-4 accent-blue-600"
          />
        </td>
        <td className="py-1 pr-3 whitespace-nowrap">
          <button
            onClick={save}
            disabled={upsert.isLoading}
            title="Confirm"
            className="inline-flex items-center text-green-700 hover:text-green-900 disabled:opacity-50 p-1 mr-1"
          >
            <IconCheck />
          </button>
          <button
            onClick={() => setEditingId(null)}
            title="Cancel"
            className="inline-flex items-center text-gray-400 hover:text-gray-600 p-1"
          >
            <IconX />
          </button>
        </td>
      </tr>
    );
  }

  const total = incomes.reduce((sum, i) => sum + i.amount, 0);

  return (
    <div>
      <datalist id={datalistId}>
        {autocomplete.map((cat) => (
          <option key={cat} value={cat} />
        ))}
      </datalist>

      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">Income</h2>
        {editMode && editingId !== 'new' && (
          <button
            onClick={() => { setRow(BLANK_EDIT); setEditingId('new'); }}
            className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700"
          >
            + Add Income
          </button>
        )}
      </div>

      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-left text-gray-500">
              <th className="py-2 pl-3 pr-4 font-medium">Name</th>
              <th className="py-2 pr-4 font-medium text-right">Amount</th>
              <th className="py-2 pr-4 font-medium">Category</th>
              <th className="py-2 pr-4 font-medium text-center">Recurring</th>
              {editMode && <th className="py-2 pr-3 font-medium w-16" />}
            </tr>
          </thead>
          <tbody>
            {incomes.map((inc) =>
              editingId === inc.id ? (
                renderEditRow(inc.id)
              ) : (
                <tr key={inc.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <td className="py-2 pl-3 pr-4">{inc.name}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{formatEurCents(inc.amount)}</td>
                  <td className="py-2 pr-4 text-gray-600">{inc.category}</td>
                  <td className="py-2 pr-4 text-center">
                    {inc.recurring === 1 ? (
                      <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">Recurring</span>
                    ) : (
                      <span className="text-gray-300 text-xs">—</span>
                    )}
                  </td>
                  {editMode && (
                    <td className="py-2 pr-3 whitespace-nowrap text-right">
                      <button
                        onClick={() => startEdit(inc)}
                        title="Edit"
                        className="inline-flex items-center text-blue-600 hover:text-blue-800 p-1 mr-1"
                      >
                        <IconPencil />
                      </button>
                      <button
                        onClick={() => setPendingDeleteId(inc.id)}
                        title="Delete"
                        className="inline-flex items-center text-red-400 hover:text-red-600 p-1"
                      >
                        <IconTrash />
                      </button>
                    </td>
                  )}
                </tr>
              )
            )}
            {editingId === 'new' && renderEditRow()}
          </tbody>
          {(incomes.length > 0 || editingId === 'new') && (
            <tfoot>
              <tr className="bg-gray-50 border-t border-gray-200">
                <td className="py-2 pl-3 pr-4 text-sm font-medium text-gray-500" colSpan={editMode ? 4 : 3}>
                  Total
                </td>
                <td className="py-2 pr-4 text-right tabular-nums font-medium">
                  {formatEurCents(total)}
                </td>
                {editMode && <td />}
              </tr>
            </tfoot>
          )}
        </table>

        {incomes.length === 0 && editingId !== 'new' && (
          <div className="py-8 text-center text-gray-400 text-sm">
            {editMode
              ? 'No income entries yet — click "+ Add Income" above to start adding.'
              : 'No income entries yet — switch to edit mode to start adding.'}
          </div>
        )}
      </div>

      {pendingDeleteId !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-80">
            <h2 className="text-base font-semibold mb-2">Delete income entry?</h2>
            <p className="text-sm text-gray-600 mb-5">
              This will permanently remove the entry from this snapshot.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setPendingDeleteId(null)} className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900">
                Cancel
              </button>
              <button
                onClick={() => remove.mutate({ id: pendingDeleteId, snapshotId })}
                disabled={remove.isLoading}
                className="bg-red-600 text-white px-4 py-1.5 rounded text-sm font-medium hover:bg-red-700 disabled:opacity-50"
              >
                {remove.isLoading ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
