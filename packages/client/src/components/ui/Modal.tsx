import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/cn';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** Footer actions, right-aligned. */
  footer?: React.ReactNode;
  size?: 'sm' | 'md';
}

const SIZES = { sm: 'max-w-sm', md: 'max-w-md' } as const;

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

// Accessible dialog: portaled, scroll-locked, focus-trapped, Escape-to-close,
// and it restores focus to whatever was focused before it opened.
export function Modal({ open, onClose, title, children, footer, size = 'sm' }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    restoreRef.current = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Focus the first field, else the panel itself.
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel)?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null
      );
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && active === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && active === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = prevOverflow;
      restoreRef.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'var(--overlay)' }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          'card w-full shadow-pop outline-none',
          'motion-safe:animate-[modal-in_140ms_ease-out]',
          SIZES[size]
        )}
      >
        <div className="p-5 sm:p-6">
          <h2 id={titleId} className="text-xl font-bold text-ink">
            {title}
          </h2>
          <div className="mt-3 text-base text-ink-muted">{children}</div>
          {footer && <div className="mt-6 flex justify-end gap-2">{footer}</div>}
        </div>
      </div>
    </div>,
    document.body
  );
}
