import { useState } from 'react';
import { trpc } from '../../lib/trpc';
import { useToast } from '../../lib/toast';
import { centsToEuroStr, eurosToCents, sanitizeEuroInput } from '../../lib/currency';
import { ReorderButtons } from './ReorderButtons';
import { t } from '../../lib/strings';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { Figure } from '../ui/Figure';
import { Delta } from '../ui/Delta';
import { Badge } from '../ui/Badge';
import { IconButton } from '../ui/IconButton';
import { IconPlus, IconPencil, IconTrash, IconCheck, IconX } from '../ui/icons';
import { computeAccountChanges, type AccountChangeRow } from '../../lib/net-worth';

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
  /** Accounts of the most recent prior snapshot, or null when there is none. */
  previousAccounts: Account[] | null;
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

export function AccountsSection({ snapshotId, accounts, previousAccounts, editMode, onUpdate }: Props) {
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

  const th = 'px-5 py-3 text-sm font-medium text-ink-muted';
  const td = 'px-5 py-3.5';
  // Kategoria and Maksettu yhteensä give way on narrow screens so the Muutos column fits.
  const wideOnly = 'hidden sm:table-cell';

  // The first rows line up with `accounts` by index; departed rows (accounts that
  // exist only in the prior snapshot) follow. Null hides the Muutos column.
  const changes = computeAccountChanges(accounts, previousAccounts);
  const showChange = changes !== null;
  const departed = changes?.filter((c) => c.kind === 'departed') ?? [];

  const typeLabel = (type: string) => t.accountType[type] ?? type;

  // Arrow follows the balance; colour follows the effect on net worth.
  function renderChange(change: AccountChangeRow<Account> | undefined) {
    if (!change) return null;
    return (
      <td className={`${td} whitespace-nowrap text-right`}>
        {change.unchanged ? (
          <span className="text-ink-muted">—</span>
        ) : (
          <Delta absolute={change.balanceChange} toneValue={change.netWorthEffect} />
        )}
      </td>
    );
  }

  function renderEditRow(id?: number) {
    const save = () => saveRow(id);
    return (
      <tr key={id ?? 'new'} className="border-b border-rule bg-accent-wash">
        <td className="px-3 py-2">
          <input className="field" value={row.name} onChange={field('name')} onKeyDown={onKey(save)} autoFocus placeholder={t.accountName} />
          {/* Kategoria's own column is hidden on narrow screens; keep it editable here. */}
          <input className="field mt-1.5 sm:hidden" value={row.category} onChange={field('category')} onKeyDown={onKey(save)} placeholder={t.category} />
        </td>
        <td className="px-3 py-2">
          <select className="field" value={row.type} onChange={field('type')} aria-label={t.type}>
            <option value="asset">{t.accountType.asset}</option>
            <option value="liability">{t.accountType.liability}</option>
          </select>
        </td>
        <td className={`px-3 py-2 ${wideOnly}`}>
          <input className="field" value={row.category} onChange={field('category')} onKeyDown={onKey(save)} placeholder={t.category} />
        </td>
        <td className="px-3 py-2">
          <input type="number" step="1" min="0" className="field text-right" value={row.balance} onChange={currencyField('balance')} onKeyDown={onKey(save)} aria-label={t.balance} />
          {/* Maksettu yhteensä's own column is hidden on narrow screens; keep it editable here. */}
          <input type="number" step="1" min="0" className="field mt-1.5 text-right sm:hidden" value={row.totalPaid} onChange={currencyField('totalPaid')} onKeyDown={onKey(save)} placeholder={t.totalPaid} aria-label={t.totalPaid} />
        </td>
        {showChange && <td className="px-3 py-2" />}
        <td className={`px-3 py-2 ${wideOnly}`}>
          <input type="number" step="1" min="0" className="field text-right" value={row.totalPaid} onChange={currencyField('totalPaid')} onKeyDown={onKey(save)} placeholder="—" aria-label={t.totalPaid} />
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

  return (
    <section>
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="flex items-baseline gap-3 text-xl font-bold text-ink">
          {t.accounts}
          {accounts.length > 0 && <span className="text-sm font-normal text-ink-muted">{t.accountCount(accounts.length)}</span>}
        </h2>
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
          <table className="w-full text-base">
            <thead>
              <tr className="border-b border-rule text-left">
                <th className={th}>{t.name}</th>
                <th className={th}>{t.type}</th>
                <th className={`${th} ${wideOnly}`}>{t.category}</th>
                <th className={`${th} text-right`}>{t.balance}</th>
                {showChange && <th className={`${th} text-right`}>{t.accountChange}</th>}
                <th className={`${th} ${wideOnly} text-right`}>{t.totalPaid}</th>
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
                    <td className={td}>
                      <Badge tone={acc.type === 'asset' ? 'accent' : 'neutral'}>{typeLabel(acc.type)}</Badge>
                    </td>
                    <td className={`${td} ${wideOnly} text-ink-muted`}>{acc.category}</td>
                    <td className={`${td} text-right`}>
                      <Figure cents={acc.balance} />
                    </td>
                    {renderChange(changes?.[index])}
                    <td className={`${td} ${wideOnly} text-right`}>
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
                          <IconPencil className="w-4 h-4" />
                        </IconButton>
                        <IconButton onClick={() => setPendingDeleteId(acc.id)} tone="loss" title={t.delete} aria-label={t.delete}>
                          <IconTrash className="w-4 h-4" />
                        </IconButton>
                      </td>
                    )}
                  </tr>
                )
              )}
              {editingId === 'new' && renderEditRow()}
              {/* Departed accounts: gone since the prior snapshot, shown so the Muutos column
                  adds up to the net worth change. Read-only, no row actions. */}
              {departed.map((row) => (
                <tr key={`departed-${row.account.id}`} className="border-b border-rule last:border-0 text-ink-muted">
                  <td className={td} title={t.accountGone}>
                    <span className="line-through">{row.account.name}</span>
                    <span className="sr-only"> ({t.accountGone})</span>
                  </td>
                  <td className={td}>{typeLabel(row.account.type)}</td>
                  <td className={`${td} ${wideOnly}`}>{row.account.category}</td>
                  <td className={`${td} text-right`}>
                    <Figure cents={0} muted />
                  </td>
                  {renderChange(row)}
                  <td className={`${td} ${wideOnly} text-right`}>—</td>
                  {editMode && <td className={td} />}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {accounts.length === 0 && editingId !== 'new' && (
          <div className="px-5 py-10 text-center text-base text-ink-muted">{t.noAccounts}</div>
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
