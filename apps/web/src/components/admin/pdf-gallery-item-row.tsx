'use client';

import { useState, type ReactNode } from 'react';
import { FileText, ImageIcon, RefreshCw, Trash2, Wand2 } from 'lucide-react';
import type { MediaDto } from '@academy/types';
import { cn } from '@/lib/utils';
import { describePdfItem, type PdfGalleryItem } from '@/lib/pdf-gallery';
import { Button, Input } from '@/components/ui';
import { PdfCover } from '@/components/sections/pdf-document-card';
import { MediaPickerDialog } from './media-picker';

/**
 * One document, as an editor sees it.
 *
 * The preview is the same `PdfCover` the published card uses, so what the
 * editor arranges is literally what a visitor gets — including the placeholder,
 * which is a real answer to "no cover" rather than an editor-only stand-in.
 *
 * The two files a document carries are kept visibly separate: the PDF is the
 * document and is replaced through the document row, the image is only its
 * cover and is replaced under the preview. Conflating them is the mistake this
 * layout exists to prevent.
 */
export function PdfGalleryItemRow({
  item,
  onChange,
  onRemove,
  onGenerateCover,
  isGeneratingCover,
}: {
  item: PdfGalleryItem;
  onChange: (patch: Partial<PdfGalleryItem>) => void;
  onRemove: () => void;
  onGenerateCover: () => void;
  isGeneratingCover: boolean;
}) {
  const [picker, setPicker] = useState<'cover' | 'document' | null>(null);
  const meta = describePdfItem(item);

  function applyPicked(media: MediaDto) {
    if (picker === 'cover') {
      onChange({ coverUrl: media.url, coverMediaId: media.id });
      return;
    }
    // Replacing the document invalidates everything derived from the old one.
    // The page count is cleared rather than kept: a stale count on a new file
    // is a worse answer than none.
    onChange({
      mediaId: media.id,
      fileName: media.originalName || media.fileName,
      sizeBytes: media.sizeBytes,
      pageCount: undefined,
    });
  }

  return (
    <div className="flex gap-4 p-3">
      <div className="w-20 shrink-0 space-y-2 sm:w-24">
        <PdfCover item={item} className="rounded-md border border-border" />
        <p className="text-center text-2xs text-text-muted">
          {item.coverUrl ? 'Cover' : 'No cover'}
        </p>
      </div>

      <div className="min-w-0 flex-1 space-y-3">
        <Input
          label="Title"
          value={item.title}
          onChange={(event) => onChange({ title: event.target.value })}
          placeholder="Shown on the card"
        />
        <Input
          label="Description"
          value={item.description ?? ''}
          onChange={(event) => onChange({ description: event.target.value })}
          placeholder="Optional — one line under the title"
        />

        <p className="flex items-center gap-1.5 truncate text-2xs text-text-muted" title={item.fileName}>
          <FileText className="size-3 shrink-0" aria-hidden="true" />
          <span className="truncate">{item.fileName}</span>
          {meta ? <span className="shrink-0">· {meta}</span> : null}
        </p>

        <div className="flex flex-wrap items-center gap-x-1 gap-y-1.5">
          <RowAction
            onClick={onGenerateCover}
            disabled={isGeneratingCover}
            icon={<Wand2 className={cn('size-3.5', isGeneratingCover && 'animate-pulse')} />}
          >
            {isGeneratingCover ? 'Rendering…' : 'Cover from page 1'}
          </RowAction>

          <RowAction onClick={() => setPicker('cover')} icon={<ImageIcon className="size-3.5" />}>
            {item.coverUrl ? 'Replace cover' : 'Choose cover'}
          </RowAction>

          {item.coverUrl ? (
            <RowAction
              onClick={() => onChange({ coverUrl: undefined, coverMediaId: undefined })}
              icon={<Trash2 className="size-3.5" />}
            >
              Remove cover
            </RowAction>
          ) : null}

          <span className="mx-1 h-4 w-px bg-border" aria-hidden="true" />

          <RowAction onClick={() => setPicker('document')} icon={<RefreshCw className="size-3.5" />}>
            Replace PDF
          </RowAction>

          <RowAction onClick={onRemove} tone="danger" icon={<Trash2 className="size-3.5" />}>
            Remove
          </RowAction>
        </div>
      </div>

      {/* Mounted only while it is open. The picker queries the library as soon
          as it exists, and a gallery renders one of these per row. */}
      {picker ? (
        <MediaPickerDialog
          open
          onClose={() => setPicker(null)}
          kind={picker === 'document' ? 'DOCUMENT' : 'IMAGE'}
          onSelect={applyPicked}
        />
      ) : null}
    </div>
  );
}

/** A compact text button, sized for a row of them under a form field. */
function RowAction({
  onClick,
  disabled,
  icon,
  tone,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  icon: ReactNode;
  tone?: 'danger';
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      onClick={onClick}
      disabled={disabled}
      className={cn('h-7 px-2 text-xs font-medium', tone === 'danger' && 'text-danger')}
    >
      <span aria-hidden="true">{icon}</span>
      {children}
    </Button>
  );
}
