import { useState } from 'react';
import { cn } from '../../lib/cn';
import { t } from '../../lib/strings';
import { sortedCategories } from '../../lib/snapshot-draft';
import { IconButton } from '../ui/IconButton';
import { IconCheck } from '../ui/icons';
import type { DraftActions } from './useDraft';

const NEW = 'new';

interface Props {
  actions: DraftActions;
  value: number | undefined;
  onChange: (id: number) => void;
  className?: string;
}

// The draft's expense categories as breadcrumb paths, plus "+ Uusi kategoria…",
// which swaps in a name + parent form. Naming an existing sibling selects it
// instead of creating a duplicate (the server keeps names unique per level).
export function CategorySelect({ actions, value, onChange, className }: Props) {
  const cats = sortedCategories(actions.draft.categories);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [parent, setParent] = useState<number | null>(null);

  function create() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const twin = cats.find((c) => c.parent_id === parent && c.name === trimmed);
    onChange(twin ? twin.id : actions.addCategory(trimmed, parent));
    setName('');
    setCreating(false);
  }

  if (creating) {
    return (
      <div className={cn('flex gap-1.5', className)}>
        <input
          autoFocus
          className="field min-w-0 flex-1"
          placeholder={t.newCategoryName}
          aria-label={t.newCategoryName}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            // Handled here only: the add-expense bar around this also submits on Enter.
            if (e.key === 'Enter' || e.key === 'Escape') e.stopPropagation();
            if (e.key === 'Enter') { e.preventDefault(); create(); }
            if (e.key === 'Escape') setCreating(false);
          }}
        />
        <select
          className="field w-36"
          aria-label={t.parentCategory}
          value={parent ?? ''}
          onChange={(e) => setParent(e.target.value === '' ? null : Number(e.target.value))}
        >
          <option value="">{t.topLevelCategory}</option>
          {cats.map((c) => <option key={c.id} value={c.id}>{c.path}</option>)}
        </select>
        <IconButton tone="accent" onClick={create} aria-label={t.createCategory} title={t.createCategory}>
          <IconCheck />
        </IconButton>
      </div>
    );
  }

  return (
    <select
      className={cn('field', className)}
      aria-label={t.category}
      value={value !== undefined && cats.some((c) => c.id === value) ? value : ''}
      onChange={(e) => (e.target.value === NEW ? setCreating(true) : onChange(Number(e.target.value)))}
    >
      <option value="" disabled>{t.selectPlaceholder}</option>
      {cats.map((c) => <option key={c.id} value={c.id}>{c.path}</option>)}
      <option value={NEW}>{t.newCategoryOption}</option>
    </select>
  );
}
