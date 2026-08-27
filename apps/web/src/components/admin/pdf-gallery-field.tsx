'use client';

import { useRef, useState } from 'react';
import { FileText, Upload } from 'lucide-react';
import type { MediaDto } from '@academy/types';
import { apiFetch } from '@/lib/api/hooks';
import { cn } from '@/lib/utils';
import { MAX_PDF_GALLERY_ITEMS, documentStreamPath, type PdfGalleryItem } from '@/lib/pdf-gallery';
import { coverFileName, renderPdfCover } from '@/lib/pdf-thumbnail';
import { Alert, Button, EmptyState } from '@/components/ui';
import { MediaPickerDialog } from './media-picker';
import { SortableList } from './sortable-list';
import { PdfGalleryItemRow } from './pdf-gallery-item-row';

/**
 * PDF gallery editor.
 *
 * Adding a document is one gesture, not four. Choosing a file uploads it,
 * renders its first page to a cover, uploads that too and fills in the page
 * count — so the common case ends with a finished card, and the title, the
 * description and a different cover are corrections rather than obligations.
 *
 * Everything after the PDF upload is best-effort. A document whose cover will
 * not render is still added, with the gallery's placeholder and a note saying
 * so; the alternative — refusing a document because its picture failed — is the
 * wrong trade for a file the editor has already chosen.
 *
 * Nothing here writes to the section. The list is handed back to
 * `SectionEditor`, which saves it with the rest of the section's content, so an
 * edit is abandoned by closing the dialog exactly like every other field.
 */

/** Where a gallery's files live in the media library. */
const UPLOAD_FOLDER = 'page-documents';

function newItemId(): string {
  // `randomUUID` needs a secure context — true for the admin panel in
  // production and on localhost, but not for every way it might be served.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `pdf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** `Q3-annual_report.pdf` → `Q3 annual report`. */
function titleFromFileName(fileName: string): string {
  const base = fileName.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return base.slice(0, 160) || fileName;
}

async function uploadToLibrary(file: File | Blob, fileName: string): Promise<MediaDto> {
  const formData = new FormData();
  formData.append('file', file, fileName);
  formData.append('folder', UPLOAD_FOLDER);
  return apiFetch<MediaDto>('/admin/media', { method: 'POST', body: formData });
}

function messageFor(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/**
 * Renders a cover and puts it in the library.
 *
 * Returns what it learned rather than writing it, so both callers — adding a
 * document and regenerating one card's cover — apply it themselves.
 */
async function buildCover(
  source: File | string,
  fileName: string,
): Promise<Pick<PdfGalleryItem, 'coverUrl' | 'coverMediaId' | 'pageCount'>> {
  const render = await renderPdfCover(source);
  const media = await uploadToLibrary(render.blob, coverFileName(fileName));
  return { coverUrl: media.url, coverMediaId: media.id, pageCount: render.pageCount };
}

export function PdfGalleryField({
  items,
  onChange,
}: {
  items: PdfGalleryItem[];
  onChange: (items: PdfGalleryItem[]) => void;
}) {
  const [picking, setPicking] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [coverBusyId, setCoverBusyId] = useState<string | null>(null);

  /**
   * The list as it stands *now*, for the asynchronous paths.
   *
   * Uploading a document and rendering its cover both take seconds, during
   * which an editor may well be typing a title into another card. Reading the
   * list out of the render that started the work would write that edit back
   * out; a ref written on every render — and advanced by the appenders
   * themselves, since a batch moves faster than React re-renders — always has
   * the current one.
   */
  const latest = useRef({ items, onChange });
  latest.current = { items, onChange };

  const isBusy = progress !== null;
  const isFull = items.length >= MAX_PDF_GALLERY_ITEMS;

  function commit(next: PdfGalleryItem[]) {
    latest.current.items = next;
    latest.current.onChange(next);
  }

  function patchItem(id: string, patch: Partial<PdfGalleryItem>) {
    commit(latest.current.items.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)));
  }

  function itemFor(media: MediaDto): PdfGalleryItem {
    return {
      id: newItemId(),
      mediaId: media.id,
      fileName: media.originalName || media.fileName,
      sizeBytes: media.sizeBytes,
      title: titleFromFileName(media.originalName || media.fileName),
    };
  }

  async function addFiles(files: File[]) {
    setError(null);
    setWarning(null);

    const accepted = files.filter(
      (file) => file.type === 'application/pdf' || /\.pdf$/i.test(file.name),
    );
    const rejected = files.length - accepted.length;

    const queue = accepted.slice(0, Math.max(0, MAX_PDF_GALLERY_ITEMS - latest.current.items.length));
    const overflow = accepted.length - queue.length;

    const notes: string[] = [];
    if (rejected > 0) {
      notes.push(`${rejected} file${rejected === 1 ? ' was' : 's were'} skipped — PDFs only.`);
    }
    if (overflow > 0) {
      notes.push(
        `${overflow} file${overflow === 1 ? '' : 's'} did not fit: a gallery holds ${MAX_PDF_GALLERY_ITEMS}.`,
      );
    }

    for (const [index, file] of queue.entries()) {
      setProgress(
        queue.length > 1
          ? `Adding ${file.name} (${index + 1} of ${queue.length})…`
          : `Adding ${file.name}…`,
      );

      let media: MediaDto;
      try {
        media = await uploadToLibrary(file, file.name);
      } catch (caught) {
        // The upload is the one failure worth stopping for — too large, wrong
        // type, no session — because the rest of the queue would fail the same
        // way. What has already been added stays.
        setError(messageFor(caught, `${file.name} could not be uploaded.`));
        break;
      }

      const item = itemFor(media);
      try {
        Object.assign(item, await buildCover(file, item.fileName));
      } catch {
        notes.push(`No cover was rendered for ${item.fileName} — choose one, or keep the placeholder.`);
      }

      commit([...latest.current.items, item]);
    }

    setProgress(null);
    setWarning(notes.length > 0 ? notes.join(' ') : null);
  }

  async function addFromLibrary(media: MediaDto) {
    setError(null);
    setWarning(null);

    if (media.mimeType !== 'application/pdf') {
      setError('That file is not a PDF. Pick a PDF, or upload one.');
      return;
    }
    if (latest.current.items.some((entry) => entry.mediaId === media.id)) {
      setError('That document is already in this gallery.');
      return;
    }
    if (latest.current.items.length >= MAX_PDF_GALLERY_ITEMS) {
      setError(`A gallery holds ${MAX_PDF_GALLERY_ITEMS} documents. Add another gallery section.`);
      return;
    }

    const item = itemFor(media);
    setProgress(`Adding ${item.fileName}…`);

    try {
      // The bytes are already on the server, so the cover is rendered from the
      // same stream a visitor reads. A document the stream will not serve —
      // one attached to a lesson, say — simply arrives without a cover.
      Object.assign(item, await buildCover(documentStreamPath(media.id), item.fileName));
    } catch {
      setWarning(`No cover was rendered for ${item.fileName} — choose one, or keep the placeholder.`);
    }

    commit([...latest.current.items, item]);
    setProgress(null);
  }

  async function regenerateCover(item: PdfGalleryItem) {
    setCoverBusyId(item.id);
    setError(null);
    setWarning(null);

    try {
      patchItem(item.id, await buildCover(documentStreamPath(item.mediaId), item.fileName));
    } catch (caught) {
      setWarning(
        messageFor(
          caught,
          `The first page of ${item.fileName} could not be rendered. Choose a cover image instead.`,
        ),
      );
    } finally {
      setCoverBusyId(null);
    }
  }

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium text-text-primary">Documents</legend>
      <p className="text-xs text-text-muted">
        Each document is a PDF plus an optional cover image. The cover is only the picture on the
        card — visitors always open the PDF itself, in a reader, without leaving the page.
      </p>

      {error ? <Alert tone="danger">{error}</Alert> : null}
      {warning ? <Alert tone="warning">{warning}</Alert> : null}

      {progress ? (
        <div className="flex items-center gap-2.5 rounded-lg border border-border bg-surface-sunken px-4 py-3">
          <span className="skeleton size-4 shrink-0 rounded-full" />
          <p role="status" className="min-w-0 truncate text-sm text-text-secondary">
            {progress}
          </p>
        </div>
      ) : null}

      {items.length === 0 && !progress ? (
        <EmptyState
          icon={<FileText className="size-7" />}
          title="No documents yet"
          description="Upload one or more PDFs. Each gets a cover rendered from its first page, which you can replace at any time."
        />
      ) : items.length > 0 ? (
        <SortableList
          items={items}
          itemLabel={(item) => item.title || item.fileName}
          onReorder={(orderedIds) =>
            commit(
              orderedIds
                .map((id) => latest.current.items.find((entry) => entry.id === id))
                .filter((entry): entry is PdfGalleryItem => Boolean(entry)),
            )
          }
          renderItem={(item) => (
            <PdfGalleryItemRow
              item={item}
              isGeneratingCover={coverBusyId === item.id}
              onChange={(patch) => patchItem(item.id, patch)}
              onRemove={() => commit(latest.current.items.filter((entry) => entry.id !== item.id))}
              onGenerateCover={() => void regenerateCover(item)}
            />
          )}
        />
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <label
          className={cn(
            'inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-lg',
            'border border-border-strong px-3.5 text-sm font-semibold text-text-primary transition-colors',
            'hover:border-primary hover:text-primary',
            'focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-border-focus',
            (isBusy || isFull) && 'pointer-events-none opacity-50',
          )}
        >
          <Upload className="size-3.5" aria-hidden="true" />
          Upload PDFs
          <input
            type="file"
            className="sr-only"
            accept="application/pdf"
            multiple
            disabled={isBusy || isFull}
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              // Cleared before the upload starts, so choosing the same file
              // twice in a row still fires a change event.
              event.target.value = '';
              if (files.length > 0) void addFiles(files);
            }}
          />
        </label>

        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={isBusy || isFull}
          onClick={() => setPicking(true)}
        >
          Choose from the library
        </Button>
      </div>

      {isFull ? (
        <p className="text-xs text-text-muted">
          This gallery is full at {MAX_PDF_GALLERY_ITEMS} documents. Add a second gallery section
          for more.
        </p>
      ) : null}

      <MediaPickerDialog
        open={picking}
        onClose={() => setPicking(false)}
        kind="DOCUMENT"
        onSelect={(media) => void addFromLibrary(media)}
      />
    </fieldset>
  );
}
