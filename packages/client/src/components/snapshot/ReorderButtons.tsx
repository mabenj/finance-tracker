import { t } from '../../lib/strings';
import { IconArrowUp, IconArrowDown } from '../ui/icons';

interface Props {
  canMoveUp: boolean;
  canMoveDown: boolean;
  /** True while a reorder request is in flight — blocks clicking on stale order. */
  pending: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

export function ReorderButtons({ canMoveUp, canMoveDown, pending, onMoveUp, onMoveDown }: Props) {
  const cls =
    'inline-flex items-center rounded-mark p-1.5 text-ink-muted transition-colors hover:bg-paper hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-ink-muted disabled:cursor-default';
  return (
    <>
      <button onClick={onMoveUp} disabled={pending || !canMoveUp} title={t.moveUp} aria-label={t.moveUp} className={cls}>
        <IconArrowUp className="w-4 h-4" />
      </button>
      <button onClick={onMoveDown} disabled={pending || !canMoveDown} title={t.moveDown} aria-label={t.moveDown} className={cls}>
        <IconArrowDown className="w-4 h-4" />
      </button>
    </>
  );
}
