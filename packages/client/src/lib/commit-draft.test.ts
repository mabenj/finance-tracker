// Round-trips a wizard draft through the real tRPC router on an in-memory DB:
// seed from last month → edit → create snapshot (server carry-forward) → commit.
import { describe, test, expect } from 'bun:test';
import { Database } from 'bun:sqlite';
import { appRouter } from '@finance-tracker/server/routers';
import { runMigrations } from '../../../server/src/db/schema';
import { commitDraft, type CommitApi } from './commit-draft';
import { itemsOf, newItemKey, seedDraft, type Draft } from './snapshot-draft';

type Caller = ReturnType<typeof appRouter.createCaller>;

function apiFor(caller: Caller): CommitApi {
  return {
    createCategory: (i) => caller.categories.create(i),
    upsertAccount: (i) => caller.accounts.upsert(i),
    deleteAccount: (i) => caller.accounts.delete(i),
    upsertIncome: (i) => caller.incomes.upsert(i),
    deleteIncome: (i) => caller.incomes.delete(i),
    upsertExpense: (i) => caller.expenses.upsert(i),
    deleteExpense: (i) => caller.expenses.delete(i),
  };
}

/** A caller with an October snapshot whose accounts, incomes and expenses are known. */
async function withOctober() {
  const db = new Database(':memory:');
  runMigrations(db);
  const caller = appRouter.createCaller({ db });
  const oct = await caller.snapshots.create({ year: 2026, month: 10 });
  const s = oct.id;
  const seeded = await caller.snapshots.get({ id: s });
  for (const a of seeded.accounts) await caller.accounts.delete({ id: a.id, snapshotId: s });

  await caller.accounts.upsert({ snapshotId: s, name: 'Käyttötili', type: 'asset', category: 'käteinen', balance: 100000 });
  await caller.accounts.upsert({ snapshotId: s, name: 'Asuntolaina', type: 'liability', category: 'laina', balance: 500000, totalPaid: 20000 });
  await caller.incomes.upsert({ snapshotId: s, name: 'Palkka', amount: 300000, category: 'palkka', recurrence: 'variable' });
  await caller.incomes.upsert({ snapshotId: s, name: 'Veronpalautus', amount: 40000, category: 'muu', recurrence: 'none' });
  const housing = await caller.categories.create({ snapshotId: s, name: 'Asuminen' });
  const power = await caller.categories.create({ snapshotId: s, name: 'Sähkö', parentId: housing.id });
  const shopping = await caller.categories.create({ snapshotId: s, name: 'Ostokset' });
  await caller.expenses.upsert({ snapshotId: s, name: 'Vastike', amount: 40000, categoryId: housing.id, recurrence: 'fixed' });
  await caller.expenses.upsert({ snapshotId: s, name: 'Käyttö', amount: 4000, categoryId: power.id, recurrence: 'variable' });
  await caller.expenses.upsert({ snapshotId: s, name: 'Siirto', amount: 2000, categoryId: power.id, recurrence: 'variable' });
  await caller.expenses.upsert({ snapshotId: s, name: 'Lehti', amount: 1500, categoryId: power.id, recurrence: 'fixed' });
  await caller.expenses.upsert({ snapshotId: s, name: 'Taksi', amount: 1500, categoryId: shopping.id, recurrence: 'none' });

  return { caller, october: await caller.snapshots.get({ id: s }) };
}

async function createAndCommit(caller: Caller, draft: Draft, api = apiFor(caller)) {
  const nov = await caller.snapshots.create({ year: draft.year, month: draft.month });
  await commitDraft(draft, await caller.snapshots.get({ id: nov.id }), api);
  return caller.snapshots.get({ id: nov.id });
}

const byName = <T extends { name: string }>(rows: T[], name: string) => rows.find((r) => r.name === name)!;

describe('commitDraft', () => {
  test('an untouched draft sends no mutations beyond what carry-forward wrote', async () => {
    const { caller, october } = await withOctober();
    const calls: string[] = [];
    const real = apiFor(caller);
    const counting = Object.fromEntries(
      Object.entries(real).map(([k, fn]) => [k, (i: never) => (calls.push(k), (fn as (i: never) => Promise<unknown>)(i))])
    ) as unknown as CommitApi;

    const nov = await createAndCommit(caller, seedDraft(2026, 11, october), counting);
    expect(calls).toEqual([]);
    expect(nov.accounts.map((a) => [a.name, a.balance])).toEqual([['Käyttötili', 100000], ['Asuntolaina', 500000]]);
  });

  test('applies edits, additions and removals and keeps the carried ghost amount', async () => {
    const { caller, october } = await withOctober();
    const d = seedDraft(2026, 11, october);
    const item = (name: string) => d.items.find((i) => i.name === name)!;

    // Accounts: new balances, loan paid down, one account added.
    item('Käyttötili').value = 120000;
    Object.assign(item('Asuntolaina'), { value: 490000, totalPaid: 30000, name: 'Asuntolaina (OP)' });
    d.items.push({ key: newItemKey(), phase: 'accounts', name: 'Säästötili', prev: null, value: 5000, recurrence: 'none', carryKey: null, type: 'asset', category: 'käteinen', totalPaid: null });

    // Incomes: fill the variable one and stop it from carrying; add a one-off.
    Object.assign(item('Palkka'), { value: 310000, recurrence: 'none' });
    d.items.push({ key: newItemKey(), phase: 'incomes', name: 'Bonus', prev: null, value: 20000, recurrence: 'none', carryKey: null, category: 'muu' });

    // Expenses: fill one, remove one, move one under a brand-new subcategory, add one-offs.
    item('Käyttö').value = 5000;
    d.items = d.items.filter((i) => i.name !== 'Siirto');
    const housing = d.categories.find((c) => c.name === 'Asuminen')!;
    d.categories.push({ id: -1, name: 'Vakuutus', parent_id: housing.id, position: 99 });
    d.categories.push({ id: -2, name: 'Harrastukset', parent_id: null, position: 99 });
    Object.assign(item('Lehti'), { categoryId: -1, value: 1600 });
    d.items.push({ key: newItemKey(), phase: 'expenses', name: 'Kotivakuutus', prev: null, value: 2500, recurrence: 'fixed', carryKey: null, categoryId: -1 });
    d.items.push({ key: newItemKey(), phase: 'expenses', name: 'Futsal', prev: null, value: 1000, recurrence: 'none', carryKey: null, categoryId: -2 });

    const nov = await createAndCommit(caller, d);

    expect(nov.accounts.map((a) => [a.name, a.type, a.balance, a.total_paid])).toEqual([
      ['Käyttötili', 'asset', 120000, null],
      ['Asuntolaina (OP)', 'liability', 490000, 30000],
      ['Säästötili', 'asset', 5000, null],
    ]);
    expect(nov.incomes.map((i) => [i.name, i.amount, i.recurrence])).toEqual([
      ['Palkka', 310000, 'none'],
      ['Bonus', 20000, 'none'],
    ]);

    const catName = new Map(nov.categories.map((c) => [c.id, c.name]));
    const parentName = (id: number) => {
      const p = nov.categories.find((c) => c.id === id)!.parent_id;
      return p === null ? null : catName.get(p);
    };
    expect(nov.expenses.map((e) => e.name).sort()).toEqual(['Futsal', 'Kotivakuutus', 'Käyttö', 'Lehti', 'Vastike']);
    expect(byName(nov.expenses, 'Käyttö')).toMatchObject({ amount: 5000, carried_amount: 4000 });
    const lehti = byName(nov.expenses, 'Lehti');
    expect([catName.get(lehti.category_id), parentName(lehti.category_id), lehti.amount]).toEqual(['Vakuutus', 'Asuminen', 1600]);
    expect(catName.get(byName(nov.expenses, 'Kotivakuutus').category_id)).toBe('Vakuutus');
    expect(parentName(byName(nov.expenses, 'Futsal').category_id)).toBeNull();
  });

  test('a blank variable row is saved at 0 and an untouched account keeps last month', async () => {
    const { caller, october } = await withOctober();
    const d = seedDraft(2026, 11, october);
    expect(itemsOf(d, 'expenses').find((e) => e.name === 'Siirto')!.value).toBeNull();
    const nov = await createAndCommit(caller, d);
    expect(byName(nov.expenses, 'Siirto').amount).toBe(0);
    expect(byName(nov.accounts, 'Asuntolaina')).toMatchObject({ balance: 500000, total_paid: 20000 });
  });

  test('same-named rows in one category are matched one-to-one', async () => {
    const { caller, october } = await withOctober();
    const power = october.categories.find((c) => c.name === 'Sähkö')!;
    await caller.expenses.upsert({ snapshotId: october.id, name: 'Käyttö', amount: 9000, categoryId: power.id, recurrence: 'fixed' });
    const d = seedDraft(2026, 11, await caller.snapshots.get({ id: october.id }));
    const twins = itemsOf(d, 'expenses').filter((e) => e.name === 'Käyttö');
    expect(twins.map((e) => e.prev)).toEqual([4000, 9000]);
    twins[0].value = 4100;

    const nov = await createAndCommit(caller, d);
    expect(nov.expenses.filter((e) => e.name === 'Käyttö').map((e) => [e.amount, e.carried_amount])).toEqual([
      [4100, 4000],
      [9000, 9000],
    ]);
  });
});
