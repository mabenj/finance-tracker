import { forwardRef } from 'react';
import { cn } from '../../lib/cn';
import { eurosToCents, sanitizeEuroInput } from '../../lib/currency';

interface Props {
  /** Whole-euro amount in cents; null renders an empty field. */
  cents: number | null;
  onChange: (cents: number | null) => void;
  className?: string;
  inputClassName?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  autoFocus?: boolean;
  'aria-label'?: string;
}

// A whole-euro amount field bound to cents: clearing it yields null, and input
// is sanitized the same way as the other amount fields (fractions truncated).
export const MoneyInput = forwardRef<HTMLInputElement, Props>(function MoneyInput(
  { cents, onChange, className, inputClassName, onKeyDown, autoFocus, 'aria-label': ariaLabel },
  ref
) {
  return (
    <div className={cn('relative', className)}>
      <input
        ref={ref}
        inputMode="numeric"
        autoFocus={autoFocus}
        aria-label={ariaLabel}
        className={cn('field figure pr-8 text-right', inputClassName)}
        value={cents === null ? '' : String(Math.round(cents / 100))}
        onChange={(e) => onChange(eurosToCents(sanitizeEuroInput(e.target.value)))}
        onKeyDown={onKeyDown}
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint" aria-hidden="true">€</span>
    </div>
  );
});
