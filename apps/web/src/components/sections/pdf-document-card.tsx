'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { FileText } from 'lucide-react';
import { cn, colorFromString } from '@/lib/utils';
import { describePdfItem, type PdfGalleryItem } from '@/lib/pdf-gallery';

/**
 * A document as a tile.
 *
 * Shared by the published gallery and the admin editor, so an editor arranges
 * exactly what a visitor will see rather than a list that approximates it.
 * The card carries no navigation of its own: the gallery decides what a click
 * does, which is what lets the editor reuse it for a preview that opens the
 * cover controls instead of the reader.
 */

/**
 * A cover, or something that reads as one.
 *
 * Portrait rather than the 16:9 the course and article cards use — a document
 * is page-shaped, and a gallery of them should look like a shelf.
 *
 * Three states, in order of preference: the editor's cover image; a
 * deterministic tint keyed on the file name, matching how a course without
 * artwork or an instructor without a photo is drawn elsewhere; and the same
 * tint again when a cover was set but will not load, because a broken image
 * icon in a grid is worse than no image at all.
 */
export function PdfCover({
  item,
  className,
  children,
}: {
  item: Pick<PdfGalleryItem, 'fileName' | 'title' | 'coverUrl'>;
  className?: string;
  /** Overlaid on the cover — the gallery's badge, the editor's controls. */
  children?: ReactNode;
}) {
  const [hasFailed, setHasFailed] = useState(false);

  // A replaced cover has to be given another chance to load; without this the
  // editor would keep showing the placeholder after fixing a broken URL.
  useEffect(() => setHasFailed(false), [item.coverUrl]);

  const accent = colorFromString(item.fileName || item.title);
  const showCover = Boolean(item.coverUrl) && !hasFailed;

  return (
    <div className={cn('relative aspect-[3/4] overflow-hidden bg-surface-sunken', className)}>
      {showCover ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.coverUrl}
          alt=""
          onError={() => setHasFailed(true)}
          className="size-full object-cover object-top transition-transform duration-500 group-hover:scale-[1.03]"
          loading="lazy"
          decoding="async"
        />
      ) : (
        <div
          className="grid size-full place-items-center"
          style={{ background: `linear-gradient(135deg, ${accent}22, ${accent}0a)` }}
          aria-hidden="true"
        >
          <FileText className="size-10" style={{ color: accent }} />
        </div>
      )}
      {children}
    </div>
  );
}

/** The "this is a document" marker every card carries. */
export function PdfKindBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-transparent bg-ink-900/85 px-2 py-0.5',
        'text-2xs font-semibold uppercase tracking-wider text-white backdrop-blur-sm',
        className,
      )}
    >
      <FileText className="size-3" aria-hidden="true" />
      PDF
    </span>
  );
}

export function PdfDocumentCard({
  item,
  onOpen,
  className,
}: {
  item: PdfGalleryItem;
  onOpen: () => void;
  className?: string;
}) {
  const meta = describePdfItem(item);

  return (
    <article
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-xl border border-border bg-surface',
        'transition-[border-color,box-shadow,transform] duration-200',
        'hover:-translate-y-0.5 hover:border-accent hover:shadow-raised',
        // The stretched button below is the card's only tab stop, so the ring
        // has to be drawn around the card rather than around the text.
        'focus-within:border-accent focus-within:shadow-raised',
        className,
      )}
    >
      <PdfCover item={item}>
        <PdfKindBadge className="absolute left-2.5 top-2.5" />
      </PdfCover>

      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <h3 className="text-sm font-semibold leading-snug text-text-primary">
          {/*
           * A button, not a link: the document opens in an overlay on this
           * page. Stretching it over the card keeps the whole tile clickable
           * without adding a second tab stop, which is the same trick the
           * course and article cards use for their links.
           */}
          <button
            type="button"
            onClick={onOpen}
            className="line-clamp-2 break-words text-left outline-none after:absolute after:inset-0 after:content-['']"
          >
            {item.title}
          </button>
        </h3>

        {item.description ? (
          <p className="line-clamp-2 text-xs leading-relaxed text-text-secondary">
            {item.description}
          </p>
        ) : null}

        {meta ? <p className="mt-auto pt-1.5 text-xs text-text-muted">{meta}</p> : null}
      </div>
    </article>
  );
}

/** Column counts an editor can choose, as a responsive grid. */
export const PDF_GRID_COLUMNS: Record<number, string> = {
  2: 'grid-cols-2',
  3: 'grid-cols-2 sm:grid-cols-3',
  4: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4',
  5: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5',
};

export function pdfGridClasses(columns: number): string {
  return PDF_GRID_COLUMNS[columns] ?? PDF_GRID_COLUMNS[4]!;
}
