// Shared inline icon set — keeps the project's no-icon-library convention while
// removing the per-component duplication the audit flagged. All icons inherit
// `currentColor` and take a className for sizing (default 1rem square).
import { cn } from '../../lib/cn';

interface IconProps {
  className?: string;
}

function base(className?: string) {
  return cn('w-4 h-4', className);
}

export function IconPlus({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" className={base(className)} aria-hidden="true">
      <path d="M10 4v12M4 10h12" />
    </svg>
  );
}

export function IconPencil({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={base(className)} aria-hidden="true">
      <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
    </svg>
  );
}

export function IconCheck({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={base(className)} aria-hidden="true">
      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
    </svg>
  );
}

export function IconX({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={base(className)} aria-hidden="true">
      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
    </svg>
  );
}

export function IconTrash({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={base(className)} aria-hidden="true">
      <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
    </svg>
  );
}

export function IconArrowUp({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={base(className)} aria-hidden="true">
      <path fillRule="evenodd" d="M10 5a1 1 0 01.7.29l5 5a1 1 0 01-1.4 1.42L10 7.4l-4.3 4.3a1 1 0 11-1.4-1.42l5-5A1 1 0 0110 5z" clipRule="evenodd" />
    </svg>
  );
}

export function IconArrowDown({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={base(className)} aria-hidden="true">
      <path fillRule="evenodd" d="M10 15a1 1 0 01-.7-.29l-5-5a1 1 0 011.4-1.42L10 12.6l4.3-4.3a1 1 0 111.4 1.42l-5 5A1 1 0 0110 15z" clipRule="evenodd" />
    </svg>
  );
}

export function IconArrowLeft({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={base(className)} aria-hidden="true">
      <path d="M11 5l-5 5 5 5M6 10h9" />
    </svg>
  );
}

export function IconEye({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className={base(className)} aria-hidden="true">
      <path d="M1.5 10S4.5 4.5 10 4.5 18.5 10 18.5 10 15.5 15.5 10 15.5 1.5 10 1.5 10z" />
      <circle cx="10" cy="10" r="2.5" />
    </svg>
  );
}

export function IconSun({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className={base(className)} aria-hidden="true">
      <circle cx="10" cy="10" r="3.5" />
      <path d="M10 1.5v2M10 16.5v2M3.5 3.5l1.4 1.4M15.1 15.1l1.4 1.4M1.5 10h2M16.5 10h2M3.5 16.5l1.4-1.4M15.1 4.9l1.4-1.4" />
    </svg>
  );
}

export function IconMoon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={base(className)} aria-hidden="true">
      <path d="M17 12.3A7 7 0 017.7 3 7 7 0 1017 12.3z" />
    </svg>
  );
}

export function IconChevron({ className, expanded }: IconProps & { expanded?: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      className={cn(base(className), 'transition-transform', expanded && 'rotate-90')}
      aria-hidden="true"
    >
      <path fillRule="evenodd" d="M7.3 5.3a1 1 0 011.4 0l4 4a1 1 0 010 1.4l-4 4a1 1 0 01-1.4-1.4L10.6 10 7.3 6.7a1 1 0 010-1.4z" clipRule="evenodd" />
    </svg>
  );
}
