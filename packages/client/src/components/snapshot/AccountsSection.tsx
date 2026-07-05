import { useState } from 'react';
import { trpc } from '../../lib/trpc';
import { useToast } from '../../lib/toast';
import { centsToEuroStr, eurosToCents, sanitizeEuroInput } from '../../lib/currency';
import { ReorderButtons } from './ReorderButtons';
import { t } from '../../lib/strings';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { Figure } from '../ui/Figure';
import { IconButton } from '../ui/IconButton';
import { IconPlus, IconPencil, IconTrash, IconCheck, IconX } from '../ui/icons';

interface Account {
  id: number;
  name: string;
  type: string;
  category: string;
  balance: number;
  total_paid: number | null;
}

interface Props {
  snapshotId: number;
  accounts: Account[];
  editMode: boolean;
  onUpdate: () => void;
}

interface RowEdit {
  name: string;
  type: 'asset' | 'liability';
  category: string;
  balance: string;
  totalPaid: string;
}

const BLANK_EDIT: RowEdit = {
  name: '',
  type: 'asset',
  category: '',
  balance: '0',
  totalPaid: '',
};

export function AccountsSection({ snapshotId, accounts, editMode, onUpdate }: Props) {
  const { showToast } = useToast();
  const [editingId, setEditingId] = useState<number | 'new' | null>(null);
  const [row, setRow] = useState<RowEdit>(BLANK_EDIT);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);

  const upsert = trpc.accounts.upsert.useMutation({
    onSuccess: () => {
      onUpdate();
      setEditingId(null);
    },
    onError: (err) => showToast(err.message),
  });

  const remove = trpc.accounts.delete.useMutation({
    onSuccess: () => {
      onUpdate();
      setPendingDeleteId(null);
    },
    onError: (err) => showToast(err.message),
  });

  const reorder = trpc.accounts.reorder.useMutation({
    onSuccess: () => onUpdate(),
    onError: (err) => showToast(err.message),
  });

  function move(index: number, dir: 'up' | 'down') {
    const target = dir === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= accounts.length) return;
    const orderedIds = accounts.map((a) => a.id);
    [orderedIds[index], orderedIds[target]] = [orderedIds[target], orderedIds[index]];
    reorder.mutate({ snapshotId, orderedIds });
  }

  function startEdit(acc: Account) {
    setEditingId(acc.id);
    setRow({
      name: acc.name,
      type: acc.type as 'asset' | 'liability',
      category: acc.category,
      balance: centsToEuroStr(acc.balance),
      totalPaid: acc.total_paid !== null ? centsToEuroStr(acc.total_paid) : '',
    });
  }

  function saveRow(id?: number) {
    const balanceCents = eurosToCents(row.balance);
    if (balanceCents === null) {
      showToast(t.invalidBalance);
      return;
    }
    const totalPaidCents = row.totalPaid !== '' ? eurosToCents(row.totalPaid) : null;
    if (row.totalPaid !== '' && totalPaidCents === null) {
      showToast(t.invalidTotalPaid);
      return;
    }
    upsert.mutate({
      ...(id !== undefined ? { id } : {}),
      snapshotId,
      name: row.name,
      type: row.type,
      category: row.category,
      balance: balanceCents,
      totalPaid: totalPaidCents,
    });
  }

  function field(key: keyof RowEdit) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
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

  const th = 'py-2 px-3 font-medium text-xs uppercase tracking-wide text-ink-muted';
  const td = 'py-2 px-3';

  function renderEditRow(id?: number) {
    const save = () => saveRow(id);
    return (
      <tr key={id ?? 'new'} className="border-b border-rule bg-accent-wash">
        <td className="py-1.5 px-3">
          <input className="field" value={row.name} onChange={field('name')} onKeyDown={onKey(save)} autoFocus placeholder={t.accountName} />
        </td>
        <td className="py-1.5 px-3">
          <select className="field" value={row.type} onChange={field('type')} aria-label={t.type}>
            <option value="asset">{t.accountType.asset}</option>
            <option value="liability">{t.accountType.liability}</option>
          </select>
        </td>
        <td className="py-1.5 px-3">
          <input className="field" value={row.category} onChange={field('category')} onKeyDown={onKey(save)} placeholder={t.category} />
        </td>
        <td className="py-1.5 px-3">
          <input type="number" step="1" min="0" className="field text-right" value={row.balance} onChange={currencyField('balance')} onKeyDown={onKey(save)} aria-label={t.balance} />
        </td>
        <td className="py-1.5 px-3">
          <input type="number" step="1" min="0" className="field text-right" value={row.totalPaid} onChange={currencyField('totalPaid')} onKeyDown={onKey(save)} placeholder="—" aria-label={t.totalPaid} />
        </td>
        <td className="py-1.5 px-3 whitespace-nowrap text-right">
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

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold text-ink">{t.accounts}</h2>
        {editMode && editingId !== 'new' && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setRow(BLANK_EDIT);
              setEditingId('new');
            }}
          >
            <IconPlus />
            {t.addAccount}
          </Button>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-rule bg-paper text-left">
                <th className={th}>{t.name}</th>
                <th className={th}>{t.type}</th>
                <th className={th}>{t.category}</th>
                <th className={`${th} text-right`}>{t.balance}</th>
                <th className={`${th} text-right`}>{t.totalPaid}</th>
                {editMode && <th className={`${th} w-24`} />}
              </tr>
            </thead>
            <tbody>
              {accounts.map((acc, index) =>
                editingId === acc.id ? (
                  renderEditRow(acc.id)
                ) : (
                  <tr key={acc.id} className="border-b border-rule last:border-0 hover:bg-paper">
                    <td className={`${td} text-ink`}>{acc.name}</td>
                    <td className={`${td} text-ink-muted`}>{t.accountType[acc.type] ?? acc.type}</td>
                    <td className={`${td} text-ink-muted`}>{acc.category}</td>
                    <td className={`${td} text-right`}>
                      <Figure cents={acc.balance} />
                    </td>
                    <td className={`${td} text-right`}>
                      {acc.total_paid !== null ? (
                        <Figure cents={acc.total_paid} muted />
                      ) : (
                        <span className="text-ink-muted">—</span>
                      )}
                    </td>
                    {editMode && (
                      <td className={`${td} whitespace-nowrap text-right`}>
                        <ReorderButtons
                          canMoveUp={index > 0}
                          canMoveDown={index < accounts.length - 1}
                          pending={reorder.isLoading}
                          onMoveUp={() => move(index, 'up')}
                          onMoveDown={() => move(index, 'down')}
                        />
                        <IconButton onClick={() => startEdit(acc)} tone="accent" title={t.edit} aria-label={t.edit}>
                          <IconPencil className="w-3.5 h-3.5" />
                        </IconButton>
                        <IconButton onClick={() => setPendingDeleteId(acc.id)} tone="loss" title={t.delete} aria-label={t.delete}>
                          <IconTrash className="w-3.5 h-3.5" />
                        </IconButton>
                      </td>
                    )}
                  </tr>
                )
              )}
              {editingId === 'new' && renderEditRow()}
            </tbody>
          </table>
        </div>

        {accounts.length === 0 && editingId !== 'new' && (
          <div className="py-8 text-center text-sm text-ink-muted">{t.noAccounts}</div>
        )}
      </div>

      <Modal
        open={pendingDeleteId !== null}
        onClose={() => setPendingDeleteId(null)}
        title={t.deleteAccountTitle}
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
        {t.deleteAccountBody}
      </Modal>
    </section>
  );
}
