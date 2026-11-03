import { cn } from '../../lib/cn';

type Tone = 'gain' | 'loss' | 'neutral' | 'accent';

const TONES: Record<Tone, string> = {
  gain: 'bg-gain-wash text-gain',
  loss: 'bg-loss-wash text-loss',
  neutral: 'bg-neutralWash text-ink-muted',
  accent: 'bg-accent-wash text-accent-ink',
};

// A small rounded pill for statuses and labels (account type, net worth change).
export function Badge({ tone, className, children }: { tone: Tone; className?: string; children: React.ReactNode }) {
  return (
    <span className={cn('figure inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-medium', TONES[tone], className)}>
      {children}
    </span>
  );
}
