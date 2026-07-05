import { cn } from '../../lib/cn';
import { formatEurCents } from '../../lib/currency';

interface Props {
  cents: number;
  muted?: boolean;
  className?: string;
}

// The signature figure: a mono, tabular EUR amount. Every monetary value in the
// app renders through this so figures share one column and compare at a glance.
export function Figure({ cents, muted, className }: Props) {
  return (
    <span className={cn('figure', muted ? 'text-ink-muted' : 'text-ink', className)}>
      {formatEurCents(cents)}
    </span>
  );
}
