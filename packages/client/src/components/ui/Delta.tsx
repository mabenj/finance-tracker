import { cn } from '../../lib/cn';
import { formatEurCents } from '../../lib/currency';

interface Props {
  /** Signed change in EUR cents. */
  absolute: number;
  /** Percentage change, or null when it can't be meaningfully expressed. */
  percentage?: number | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZES = {
  sm: { text: 'text-sm', pct: 'text-xs', tri: 7 },
  md: { text: 'text-base', pct: 'text-sm', tri: 8 },
  lg: { text: 'text-xl', pct: 'text-base', tri: 10 },
} as const;

// Direction is a solid triangle mark (drawn, not emoji); color reinforces it.
function Triangle({ up, size }: { up: boolean; size: number }) {
  const h = (size * Math.sqrt(3)) / 2;
  return (
    <svg width={size} height={h} viewBox={`0 0 ${size} ${h}`} aria-hidden="true" className="shrink-0">
      {up ? (
        <path d={`M${size / 2} 0 L${size} ${h} L0 ${h} Z`} fill="currentColor" />
      ) : (
        <path d={`M0 0 L${size} 0 L${size / 2} ${h} Z`} fill="currentColor" />
      )}
    </svg>
  );
}

// Quiet, consistent gain/loss treatment used everywhere a change is shown.
export function Delta({ absolute, percentage = null, size = 'sm', className }: Props) {
  const positive = absolute >= 0;
  const s = SIZES[size];
  return (
    <span
      className={cn(
        'figure inline-flex items-center gap-1.5 font-medium',
        positive ? 'text-gain' : 'text-loss',
        s.text,
        className
      )}
    >
      <Triangle up={positive} size={s.tri} />
      {formatEurCents(Math.abs(absolute))}
      {percentage !== null && (
        <span className={s.pct}>
          {positive ? '+' : '−'}
          {Math.abs(percentage).toFixed(1)}%
        </span>
      )}
    </span>
  );
}
