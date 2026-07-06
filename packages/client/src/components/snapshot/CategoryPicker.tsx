import { useState, useEffect } from 'react';
import { trpc } from '../../lib/trpc';
import { useToast } from '../../lib/toast';
import { t } from '../../lib/strings';
import { IconButton } from '../ui/IconButton';
import { IconX } from '../ui/icons';

interface Category {
  id: number;
  name: string;
  parent_id: number | null;
  position: number;
}

interface Props {
  snapshotId: number;
  categories: Category[];
  value: number | null;
  onChange: (id: number) => void;
  onCategoriesUpdate: (newCat: Category) => void;
}

function buildPathToValue(categories: Category[], value: number | null): number[] {
  if (value === null) return [];
  const path: number[] = [];
  let current: number | null = value;
  while (current !== null) {
    path.unshift(current);
    const cat = categories.find((c) => c.id === current);
    current = cat?.parent_id ?? null;
  }
  return path;
}

export function CategoryPicker({ snapshotId, categories, value, onChange, onCategoriesUpdate }: Props) {
  const { showToast } = useToast();
  const [path, setPath] = useState<number[]>(() => buildPathToValue(categories, value));
  const [newLevel, setNewLevel] = useState<number | null>(null);

  // Re-sync path when the controlled value changes from outside (e.g., parent switches expense).
  // Uses categories prop (not allCats) because external value changes reference server-known categories.
  useEffect(() => {
    setPath(buildPathToValue(categories, value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const [newName, setNewName] = useState('');

  // The `categories` prop is the parent's merged list (server + its optimistic
  // cache), so a category created here shows up via onCategoriesUpdate without
  // the picker needing its own local cache.
  const create = trpc.categories.create.useMutation({
    onSuccess: (newCat) => {
      onCategoriesUpdate(newCat);
      const level =
        newCat.parent_id === null ? 0 : path.findIndex((id) => id === newCat.parent_id) + 1;
      const newPath = [...path.slice(0, level), newCat.id];
      setPath(newPath);
      onChange(newCat.id);
      setNewLevel(null);
      setNewName('');
    },
    onError: (err) => showToast(err.message),
  });

  function getCatsAt(level: number): Category[] {
    if (level === 0) return categories.filter((c) => c.parent_id === null);
    const parentId = path[level - 1];
    if (parentId === undefined) return [];
    return categories.filter((c) => c.parent_id === parentId);
  }

  function handleChange(level: number, raw: string) {
    if (raw === '__new__') {
      setNewLevel(level);
      setNewName('');
      return;
    }
    const id = Number(raw);
    const newPath = [...path.slice(0, level), id];
    setPath(newPath);
    onChange(id);
    setNewLevel(null);
  }

  function submitNew() {
    if (newLevel === null || !newName.trim()) return;
    const parentId = newLevel === 0 ? undefined : path[newLevel - 1];
    create.mutate({ snapshotId, name: newName.trim(), parentId });
  }

  // Always show level 0; show level N if path[N-1] is selected
  const levelCount = path.length + 1;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {Array.from({ length: levelCount }, (_, level) => {
        const opts = getCatsAt(level);
        // Skip deeper levels that have no options and aren't in "new" mode
        if (level > 0 && opts.length === 0 && newLevel !== level) return null;

        return (
          <span key={level} className="flex items-center gap-1.5">
            {level > 0 && <span className="text-xs text-ink-muted">›</span>}

            {newLevel === level ? (
              <span className="flex items-center gap-1">
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') submitNew();
                    if (e.key === 'Escape') { setNewLevel(null); setNewName(''); }
                  }}
                  placeholder={t.newCategoryName}
                  className="field w-40 border-accent"
                />
                <button
                  onClick={submitNew}
                  disabled={create.isLoading}
                  className="rounded-mark bg-accent px-2 py-1 text-xs font-medium text-onFill transition-colors hover:bg-accent-hover disabled:opacity-50"
                >
                  {t.add}
                </button>
                <IconButton
                  onClick={() => { setNewLevel(null); setNewName(''); }}
                  tone="muted"
                  title={t.cancel}
                  aria-label={t.cancel}
                >
                  <IconX className="w-3.5 h-3.5" />
                </IconButton>
              </span>
            ) : (
              <select
                className="field w-auto"
                value={path[level] ?? ''}
                onChange={(e) => handleChange(level, e.target.value)}
              >
                <option value="" disabled>{t.selectPlaceholder}</option>
                {opts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
                <option value="__new__">{t.addNew}</option>
              </select>
            )}
          </span>
        );
      })}
    </div>
  );
}
