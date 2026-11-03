import { useState } from 'react';
import { newItemKey, type Draft, type DraftItem } from '../../lib/snapshot-draft';

export interface DraftActions {
  draft: Draft;
  /** True once anything has changed since seeding. */
  dirty: boolean;
  update: (key: string, patch: Partial<DraftItem>) => void;
  /** Adds a row created in the wizard; returns its key. */
  add: (item: Omit<DraftItem, 'key' | 'carryKey' | 'prev'>) => string;
  remove: (key: string) => void;
  /** Adds a category created in the wizard; returns its (negative) draft id. */
  addCategory: (name: string, parentId: number | null) => number;
}

let categorySeq = 0;

export function useDraft(initial: Draft): DraftActions {
  const [draft, setDraft] = useState(initial);
  const setItems = (fn: (items: DraftItem[]) => DraftItem[]) => setDraft((d) => ({ ...d, items: fn(d.items) }));

  return {
    draft,
    dirty: draft !== initial,
    update: (key, patch) => setItems((items) => items.map((it) => (it.key === key ? { ...it, ...patch } : it))),
    add: (item) => {
      const key = newItemKey();
      setItems((items) => [...items, { ...item, key, carryKey: null, prev: null }]);
      return key;
    },
    remove: (key) => setItems((items) => items.filter((it) => it.key !== key)),
    addCategory: (name, parentId) => {
      // Negative ids never collide with server ids; commitDraft creates these.
      const id = --categorySeq;
      setDraft((d) => ({ ...d, categories: [...d.categories, { id, name, parent_id: parentId, position: Number.MAX_SAFE_INTEGER }] }));
      return id;
    },
  };
}
