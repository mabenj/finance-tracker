import { forwardRef } from 'react';
import { cn } from '../../lib/cn';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'link';
type Size = 'sm' | 'md';

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

// The primary action is the one solid accent fill on screen; everything else
// stays neutral. Focus is handled globally via :focus-visible.
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-onFill hover:bg-accent-hover shadow-sheet',
  secondary: 'bg-sheet text-ink border border-rule-strong hover:bg-paper',
  danger: 'bg-loss text-onFill hover:bg-loss-hover shadow-sheet',
  ghost: 'text-ink-muted hover:text-ink hover:bg-paper',
  link: 'text-accent-ink hover:text-accent-ink-hover hover:underline underline-offset-2 px-0',
};

// 44px min-height on touch viewports (quality floor), tightening to 40px on ≥sm.
const SIZES: Record<Size, string> = {
  sm: 'text-sm px-3 min-h-[2.5rem] sm:min-h-[2.25rem]',
  md: 'text-sm px-4 min-h-[2.75rem] sm:min-h-[2.5rem]',
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = 'primary', size = 'md', className, type = 'button', ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-control font-semibold',
        'transition-colors duration-100',
        'disabled:opacity-50 disabled:pointer-events-none',
        variant !== 'link' && SIZES[size],
        VARIANTS[variant],
        className
      )}
      {...rest}
    />
  );
});
