import { cn } from '../../lib/cn';
import { formatEurCents } from '../../lib/currency';

interface Props {
  /** Signed change in EUR cents. */
  absolute: number;
  /** Percentage change, or null when it can't be meaningfully expressed. */
  percentage?: number | null;
  /**
   * Signed value whose sign picks the green/red tone, when it should differ from
   * the sign (e.g. a falling liability: "−336 €", tone gain). Defaults to `absolute`.
   */
  toneValue?: number;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZES = {
  sm: { text: 'text-base', pct: 'text-sm' },
  md: { text: 'text-lg', pct: 'text-base' },
  lg: { text: 'text-xl', pct: 'text-base' },
} as const;

const sign = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '');

// A signed change ("+247 €", "−336 €") whose colour reports good or bad.
export function Delta({ absolute, percentage = null, toneValue = absolute, size = 'sm', className }: Props) {
  const s = SIZES[size];
  return (
    <span
      className={cn(
        'figure inline-flex items-baseline gap-1.5 font-medium',
        toneValue >= 0 ? 'text-gain' : 'text-loss',
        s.text,
        className
      )}
    >
      {sign(absolute)}
      {formatEurCents(Math.abs(absolute))}
      {percentage !== null && (
        <span className={cn(s.pct, 'opacity-80')}>
          ({sign(percentage)}
          {Math.abs(percentage).toFixed(1)} %)
        </span>
      )}
    </span>
  );
}
