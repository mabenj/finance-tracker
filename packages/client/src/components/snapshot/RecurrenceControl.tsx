import { useState } from 'react';
import { cn } from '../../lib/cn';
import { formatEurCents } from '../../lib/currency';
import { t } from '../../lib/strings';

export type Recurrence = 'none' | 'fixed' | 'variable';

interface Props {
  value: Recurrence;
  onChange: (value: Recurrence) => void;
  // The expense forms wrap the checkbox in its own "Toistuva" label; the income
  // table already has a "Toistuva" column header, so it hides the label.
  showLabel?: boolean;
  className?: string;
}

// The "Toistuva" checkbox plus, when checked, an inline Kiinteä | Muuttuva pill
// pair on the same line. The pill choice is remembered in local state while the
// control is mounted (i.e. while the form is open), so unchecking and re-checking
// restores the last kind rather than snapping back to the default.
export function RecurrenceControl({ value, onChange, showLabel = true, className }: Props) {
  const [kind, setKind] = useState<'fixed' | 'variable'>(value === 'variable' ? 'variable' : 'fixed');
  const checked = value !== 'none';

  function selectKind(next: 'fixed' | 'variable') {
    setKind(next);
    onChange(next);
  }

  const checkbox = (
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked ? kind : 'none')}
      className="h-4 w-4 rounded accent-[var(--accent)]"
      aria-label={t.recurring}
    />
  );

  return (
    <div className={cn('flex items-center gap-3', className)}>
      {showLabel ? (
        <label className="flex cursor-pointer items-center gap-1.5 text-sm text-ink-muted">
          {checkbox}
          {t.recurring}
        </label>
      ) : (
        checkbox
      )}
      {checked && (
        <div className="inline-flex overflow-hidden rounded-mark border border-rule-strong" role="group">
          <Pill selected={value === 'fixed'} onClick={() => selectKind('fixed')}>
            {t.recurrenceFixed}
          </Pill>
          <Pill selected={value === 'variable'} onClick={() => selectKind('variable')}>
            {t.recurrenceVariable}
          </Pill>
        </div>
      )}
    </div>
  );
}

// The read-only row marker: `↻` for fixed, `↻⁰` for variable, each with a
// Finnish tooltip. One-off rows render nothing, or an em dash when `emptyDash`
// is set (the income table keeps a placeholder in its "Toistuva" column).
export function RecurrenceMarker({
  recurrence,
  emptyDash = false,
  className,
}: {
  recurrence: Recurrence;
  emptyDash?: boolean;
  className?: string;
}) {
  if (recurrence === 'fixed') {
    return <span className={cn('text-xs text-ink-muted', className)} title={t.recurrenceFixedTooltip}>↻</span>;
  }
  if (recurrence === 'variable') {
    return <span className={cn('text-xs text-ink-muted', className)} title={t.recurrenceVariableTooltip}>↻⁰</span>;
  }
  return emptyDash ? <span className="text-xs text-ink-muted">—</span> : null;
}

// The "ed. kk" ghost hint: last month's carried amount, shown beside the current
// figure on variable rows only. Muted ink, never green/red (redesign rule: color
// only on real figures). Renders nothing unless the row is variable and actually
// carries an amount — so hand-created rows (null carried amount) and fixed/one-off
// rows show no hint, and it appears/disappears purely with the current kind.
export function CarriedHint({
  recurrence,
  carriedAmount,
  className,
}: {
  recurrence: Recurrence;
  carriedAmount: number | null;
  className?: string;
}) {
  if (recurrence !== 'variable' || carriedAmount === null) return null;
  return (
    <span
      className={cn('figure text-xs text-ink-muted', className)}
      title={t.carriedHintTooltip}
    >
      {t.carriedHint(formatEurCents(carriedAmount))}
    </span>
  );
}

function Pill({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'px-2 py-0.5 text-xs font-medium transition-colors',
        selected ? 'bg-accent text-onFill' : 'bg-sheet text-ink-muted hover:text-ink'
      )}
    >
      {children}
    </button>
  );
}
