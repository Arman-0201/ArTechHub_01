'use client';

import { useCallback, useState } from 'react';
import { cn } from '@/lib/utils';
import type { PdfGalleryItem } from '@/lib/pdf-gallery';
import { PdfDocumentCard, pdfGridClasses } from './pdf-document-card';
import { PdfViewerDialog } from './pdf-viewer-dialog';

/**
 * The interactive half of a PDF gallery.
 *
 * Split out from the section so the section itself — heading, background,
 * spacing — stays a Server Component like every other one, and the client
 * bundle carries only the grid, the overlay and the reader that overlay pulls
 * in on demand.
 *
 * Which document is open is state, not a route: the gallery lives inside a page
 * whose other sections are its context, and closing the reader should leave a
 * visitor exactly where they were.
 */
export function PdfGalleryGrid({
  items,
  columns,
  className,
}: {
  items: PdfGalleryItem[];
  columns: number;
  className?: string;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  // Guards against an index left behind by an edit or a hot reload: a stale
  // index would otherwise index past the end and crash the overlay.
  const active = openIndex === null ? null : (items[openIndex] ?? null);

  const step = useCallback(
    (delta: number) =>
      setOpenIndex((current) => {
        if (current === null) return current;
        const next = current + delta;
        return next >= 0 && next < items.length ? next : current;
      }),
    [items.length],
  );

  return (
    <>
      <ul className={cn('grid gap-4 sm:gap-5', pdfGridClasses(columns), className)}>
        {items.map((item, index) => (
          <li key={item.id} className="flex">
            <PdfDocumentCard item={item} onOpen={() => setOpenIndex(index)} className="w-full" />
          </li>
        ))}
      </ul>

      {active && openIndex !== null ? (
        <PdfViewerDialog
          item={active}
          position={{ index: openIndex, total: items.length }}
          onClose={() => setOpenIndex(null)}
          {...(openIndex > 0 ? { onPrevious: () => step(-1) } : {})}
          {...(openIndex < items.length - 1 ? { onNext: () => step(1) } : {})}
        />
      ) : null}
    </>
  );
}
