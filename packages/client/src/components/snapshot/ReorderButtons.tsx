import { t } from '../../lib/strings';

// Inline SVG chevrons — matches the project's no-icon-library convention.
function IconArrowUp() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" d="M10 5a1 1 0 01.7.29l5 5a1 1 0 01-1.4 1.42L10 7.4l-4.3 4.3a1 1 0 11-1.4-1.42l5-5A1 1 0 0110 5z" clipRule="evenodd" />
    </svg>
  );
}

function IconArrowDown() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" d="M10 15a1 1 0 01-.7-.29l-5-5a1 1 0 011.4-1.42L10 12.6l4.3-4.3a1 1 0 111.4 1.42l-5 5A1 1 0 0110 15z" clipRule="evenodd" />
    </svg>
  );
}

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
    'inline-flex items-center text-gray-400 hover:text-gray-700 disabled:opacity-25 disabled:hover:text-gray-400 disabled:cursor-default p-1';
  return (
    <>
      <button onClick={onMoveUp} disabled={pending || !canMoveUp} title={t.moveUp} aria-label={t.moveUp} className={cls}>
        <IconArrowUp />
      </button>
      <button onClick={onMoveDown} disabled={pending || !canMoveDown} title={t.moveDown} aria-label={t.moveDown} className={cls}>
        <IconArrowDown />
      </button>
    </>
  );
}
