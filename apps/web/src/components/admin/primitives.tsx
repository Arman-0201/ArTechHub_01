'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import Link from 'next/link';
import { AlertTriangle, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, Card } from '@/components/ui';

/**
 * Admin building blocks.
 *
 * Shared so every admin screen has the same header, table, dialog and empty
 * state — consistency here is what keeps a 20-screen panel learnable.
 */

export function AdminPageHeader({
  title,
  description,
  action,
  breadcrumb,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  breadcrumb?: { label: string; href: string };
}) {
  return (
    <header className="mb-6 space-y-3">
      {breadcrumb ? (
        <Link
          href={breadcrumb.href}
          className="inline-flex items-center gap-1.5 text-sm text-text-muted transition-colors hover:text-primary"
        >
          ← {breadcrumb.label}
        </Link>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary">{title}</h1>
          {description ? <p className="text-text-secondary">{description}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ table */

export function DataTable({
  headers,
  children,
  isLoading,
  isEmpty,
  emptyMessage = 'Nothing here yet.',
  colSpan,
}: {
  headers: ReactNode[];
  children: ReactNode;
  isLoading?: boolean;
  isEmpty?: boolean;
  emptyMessage?: string;
  colSpan?: number;
}) {
  const columnCount = colSpan ?? headers.length;

  return (
    // Wide tables scroll inside their own box rather than widening the page.
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <table className="w-full min-w-[40rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-sunken">
            {headers.map((header, index) => (
              <th
                key={index}
                scope="col"
                className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-muted"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {isLoading ? (
            <tr>
              <td colSpan={columnCount} className="px-4 py-12 text-center">
                <Loader2
                  className="mx-auto size-5 animate-spin text-text-muted"
                  aria-hidden="true"
                />
                <span className="sr-only">Loading</span>
              </td>
            </tr>
          ) : isEmpty ? (
            <tr>
              <td colSpan={columnCount} className="px-4 py-12 text-center text-text-muted">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            children
          )}
        </tbody>
      </table>
    </div>
  );
}

export function TableRow({ children, className }: { children: ReactNode; className?: string }) {
  return <tr className={cn('transition-colors hover:bg-surface-sunken', className)}>{children}</tr>;
}

export function TableCell({
  children,
  className,
  align = 'left',
}: {
  children: ReactNode;
  className?: string;
  align?: 'left' | 'right' | 'center';
}) {
  return (
    <td
      className={cn(
        'px-4 py-3 align-middle text-text-secondary',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className,
      )}
    >
      {children}
    </td>
  );
}

/* ----------------------------------------------------------------- dialog */

/**
 * Modal dialog.
 *
 * Focus moves into the dialog on open and returns to the trigger on close,
 * Escape dismisses it, and Tab is trapped inside — the behaviour a native
 * `<dialog>` would give, implemented explicitly so the styling and animation
 * stay under our control.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';

    const focusable = panelRef.current?.querySelector<HTMLElement>(
      'input, select, textarea, button, [href], [tabindex]:not([tabindex="-1"])',
    );
    focusable?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;

      const elements = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.offsetParent !== null);

      if (elements.length === 0) return;

      const first = elements[0]!;
      const last = elements[elements.length - 1]!;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
      previouslyFocused.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4">
      <button
        type="button"
        onClick={onClose}
        className="fixed inset-0 cursor-default bg-[var(--color-overlay)] backdrop-blur-sm"
        aria-label="Close dialog"
        tabIndex={-1}
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={cn(
          'relative my-8 w-full animate-[fade-up_0.2s_ease-out] rounded-2xl border border-border bg-surface-raised shadow-overlay',
          widths[size],
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border p-5">
          <div className="min-w-0 space-y-1">
            <h2 id="modal-title" className="text-lg font-semibold text-text-primary">
              {title}
            </h2>
            {description ? <p className="text-sm text-text-muted">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-8 shrink-0 place-items-center rounded-md text-text-muted transition-colors hover:bg-surface-sunken"
            aria-label="Close"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        <div className="max-h-[65vh] overflow-y-auto p-5">{children}</div>

        {footer ? (
          <div className="flex items-center justify-end gap-3 border-t border-border p-5">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Confirmation for irreversible actions. */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Delete',
  isLoading,
  tone = 'danger',
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  isLoading?: boolean;
  tone?: 'danger' | 'primary';
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} isLoading={isLoading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex gap-3">
        {tone === 'danger' ? (
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden="true" />
        ) : null}
        <p className="text-sm text-text-secondary">{message}</p>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ stats */

/**
 * `icon` is a rendered element, not a component reference.
 *
 * This is a client component, and Server Components render most of the admin
 * dashboard. A component *reference* (`Icon={Users}`) is a function, and
 * functions cannot cross the server/client boundary — React throws
 * "Functions cannot be passed directly to Client Components". A rendered
 * *element* (`icon={<Users />}`) serialises fine.
 */
export function StatCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-text-muted">{label}</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-text-primary">{value}</p>
          {hint ? <p className="mt-0.5 text-xs text-text-muted">{hint}</p> : null}
        </div>
        {icon ? (
          <span
            className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary"
            aria-hidden="true"
          >
            {icon}
          </span>
        ) : null}
      </div>
    </Card>
  );
}
