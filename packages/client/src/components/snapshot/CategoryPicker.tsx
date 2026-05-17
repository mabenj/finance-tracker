import { useState, useMemo } from 'react';
import { trpc } from '../../lib/trpc';
import { useToast } from '../../lib/toast';

interface Category {
  id: number;
  name: string;
  parent_id: number | null;
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
  const [newName, setNewName] = useState('');
  const [localCats, setLocalCats] = useState<Category[]>([]);

  // Merge prop categories with locally created ones (deduped by id)
  const allCats = useMemo(() => {
    const byId = new Map<number, Category>();
    for (const c of categories) byId.set(c.id, c);
    for (const c of localCats) byId.set(c.id, c);
    return Array.from(byId.values());
  }, [categories, localCats]);

  const create = trpc.categories.create.useMutation({
    onSuccess: (newCat) => {
      setLocalCats((prev) => [...prev, newCat]);
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
    if (level === 0) return allCats.filter((c) => c.parent_id === null);
    const parentId = path[level - 1];
    if (parentId === undefined) return [];
    return allCats.filter((c) => c.parent_id === parentId);
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

  const sel = 'border border-gray-300 rounded px-2 py-1 text-sm';

  // Always show level 0; show level N if path[N-1] is selected
  const levelCount = path.length + 1;

  return (
    <div className="flex flex-wrap items-center gap-1">
      {Array.from({ length: levelCount }, (_, level) => {
        const opts = getCatsAt(level);
        // Skip deeper levels that have no options and aren't in "new" mode
        if (level > 0 && opts.length === 0 && newLevel !== level) return null;

        return (
          <span key={level} className="flex items-center gap-1">
            {level > 0 && <span className="text-gray-400 text-xs">›</span>}

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
                  placeholder="New category name"
                  className="border border-blue-400 rounded px-2 py-1 text-sm w-40"
                />
                <button
                  onClick={submitNew}
                  disabled={create.isLoading}
                  className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  Add
                </button>
                <button
                  onClick={() => { setNewLevel(null); setNewName(''); }}
                  className="text-xs text-gray-500 hover:text-gray-700 px-1"
                >
                  ✕
                </button>
              </span>
            ) : (
              <select
                className={sel}
                value={path[level] ?? ''}
                onChange={(e) => handleChange(level, e.target.value)}
              >
                <option value="" disabled>— select —</option>
                {opts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
                <option value="__new__">+ New…</option>
              </select>
            )}
          </span>
        );
      })}
    </div>
  );
}
