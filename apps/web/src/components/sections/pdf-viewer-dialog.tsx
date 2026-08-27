'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PdfReader } from '@/components/content/pdf-reader';
import { describePdfItem, documentStreamPath, toPdfReaderSource, type PdfGalleryItem } from '@/lib/pdf-gallery';

/**
 * The gallery's reading surface.
 *
 * An overlay rather than a route. A gallery sits inside a CMS page whose other
 * sections are the context for it, and the pages it appears on are addressed by
 * an editor-chosen slug — a dedicated route would mean inventing a URL scheme
 * for documents that have no home of their own, and would throw away the page a
 * visitor was reading to show one file. Opening in place is also what the rest
 * of the app does with a full-screen surface: search is a dialog, media is a
 * dialog.
 *
 * The dialog behaviour matches the admin `Modal` deliberately — Escape closes,
 * focus moves in and returns to the card that opened it, Tab is trapped, and
 * the page behind does not scroll — but the frame is its own: a document wants
 * the whole window, not a centred panel with a capped body.
 */
export function PdfViewerDialog({
  item,
  onClose,
  onPrevious,
  onNext,
  position,
}: {
  item: PdfGalleryItem;
  onClose: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
  /** `{ index, total }` — shown only when the gallery holds more than one. */
  position?: { index: number; total: number };
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const meta = describePdfItem(item);

  useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';

    // The panel itself, not its first button: the dialog is labelled by the
    // document's title, so landing on it is what announces which document
    // opened. Landing on "Close" would announce only the way out.
    panelRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;

      const elements = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
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
    // Bound once for the life of the overlay: stepping between documents swaps
    // the reader, not the dialog, so re-running this would steal focus back to
    // the close button on every step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center sm:p-6">
      <button
        type="button"
        onClick={onClose}
        className="fixed inset-0 cursor-default bg-[var(--color-overlay)] backdrop-blur-sm"
        aria-label="Close the document"
        tabIndex={-1}
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pdf-viewer-title"
        tabIndex={-1}
        className={cn(
          'relative flex h-full max-h-full w-full flex-col overflow-hidden bg-surface-raised',
          'animate-[fade-up_0.2s_ease-out] shadow-overlay',
          'sm:h-[calc(100dvh-3rem)] sm:max-w-5xl sm:rounded-2xl sm:border sm:border-border',
        )}
      >
        <header className="flex shrink-0 items-start gap-3 border-b border-border p-4">
          <div className="min-w-0 flex-1">
            <h2
              id="pdf-viewer-title"
              className="truncate text-base font-semibold text-text-primary"
              title={item.title}
            >
              {item.title}
            </h2>
            <p className="truncate text-xs text-text-muted">
              {[position && position.total > 1 ? `${position.index + 1} of ${position.total}` : '', meta]
                .filter(Boolean)
                .join(' · ') || item.fileName}
            </p>
          </div>

          {onPrevious || onNext ? (
            <div className="flex shrink-0 items-center gap-0.5">
              <HeaderButton label="Previous document" onClick={onPrevious}>
                <ChevronLeft className="size-4" aria-hidden="true" />
              </HeaderButton>
              <HeaderButton label="Next document" onClick={onNext}>
                <ChevronRight className="size-4" aria-hidden="true" />
              </HeaderButton>
            </div>
          ) : null}

          <HeaderButton label="Close" onClick={onClose}>
            <X className="size-4" aria-hidden="true" />
          </HeaderButton>
        </header>

        {/*
         * Keyed on the document so switching to the next one mounts a fresh
         * reader. pdf.js holds a worker, a loading task and a page cache per
         * document; reusing the component would mean unpicking all of it by
         * hand, and a remount is what its own teardown is written for.
         */}
        <PdfReader
          key={item.mediaId}
          pdf={toPdfReaderSource(item)}
          documentId={item.mediaId}
          downloadUrl={documentStreamPath(item.mediaId)}
          height="fill"
          className="min-h-0 flex-1 rounded-none border-0"
        />
      </div>
    </div>
  );
}

function HeaderButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      aria-label={label}
      title={label}
      className={cn(
        'grid size-8 shrink-0 place-items-center rounded-md text-text-muted transition-colors',
        'hover:bg-surface-sunken hover:text-text-primary',
        'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent',
      )}
    >
      {children}
    </button>
  );
}
