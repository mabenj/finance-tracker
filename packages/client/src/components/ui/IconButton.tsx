import { forwardRef } from 'react';
import { cn } from '../../lib/cn';

type Tone = 'muted' | 'accent' | 'gain' | 'loss';

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: Tone;
}

// Icon-only action button used in dense table/tree rows. Each tone meets the
// ≥3:1 non-text contrast floor at rest and gets a matching wash on hover.
const TONES: Record<Tone, string> = {
  muted: 'text-ink-muted hover:text-ink hover:bg-paper',
  accent: 'text-accent hover:text-accent-hover hover:bg-accent-wash',
  gain: 'text-gain hover:text-gain-hover hover:bg-gain-wash',
  loss: 'text-loss hover:text-loss-hover hover:bg-loss-wash',
};

export const IconButton = forwardRef<HTMLButtonElement, Props>(function IconButton(
  { tone = 'muted', className, type = 'button', ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex items-center justify-center rounded-mark p-1.5 transition-colors',
        'disabled:opacity-40 disabled:pointer-events-none',
        TONES[tone],
        className
      )}
      {...rest}
    />
  );
});
