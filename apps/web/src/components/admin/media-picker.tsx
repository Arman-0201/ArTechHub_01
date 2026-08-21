'use client';

import { useState } from 'react';
import { FileText, ImageIcon, Search, Trash2, Upload, Video } from 'lucide-react';
import type { MediaDto, MediaKind } from '@academy/types';
import { api, apiFetch, useApiList, useApiMutation } from '@/lib/api/hooks';
import { cn } from '@/lib/utils';
import { Alert, Button, Input } from '@/components/ui';
import { Modal } from './primitives';

/**
 * Media library picker.
 *
 * One component serves every "choose a file" need in the admin panel — course
 * thumbnails, lesson posters, section images, product photos — so the browse,
 * search and upload behaviour is identical everywhere.
 */

const KIND_ICONS: Record<string, typeof ImageIcon> = {
  IMAGE: ImageIcon,
  VIDEO: Video,
  DOCUMENT: FileText,
};

export function MediaPickerDialog({
  open,
  onClose,
  onSelect,
  kind,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (media: MediaDto) => void;
  kind?: MediaKind;
}) {
  const [search, setSearch] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const mediaQuery = useApiList<MediaDto>(
    '/admin/media',
    { pageSize: 40, kind, search: search || undefined },
    { enabled: open },
  );

  async function upload(file: File) {
    setUploadError(null);
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const media = await apiFetch<MediaDto>('/admin/media', { method: 'POST', body: formData });
      // Selecting immediately is what the admin wanted when they hit upload.
      onSelect(media);
      onClose();
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Upload failed.');
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Media library" size="xl">
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <Input
            type="search"
            placeholder="Search media…"
            aria-label="Search media"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            leadingIcon={<Search className="size-4" />}
            containerClassName="flex-1"
          />

          <label
            className={cn(
              'inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-lg',
              'border border-border px-4 text-sm font-medium text-text-secondary transition-colors',
              'hover:border-primary hover:text-primary',
            )}
          >
            <Upload className="size-4" aria-hidden="true" />
            {isUploading ? 'Uploading…' : 'Upload'}
            <input
              type="file"
              className="sr-only"
              disabled={isUploading}
              accept={
                kind === 'IMAGE'
                  ? 'image/*'
                  : kind === 'VIDEO'
                    ? 'video/*'
                    : kind === 'DOCUMENT'
                      ? 'application/pdf'
                      : undefined
              }
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void upload(file);
                event.target.value = '';
              }}
            />
          </label>
        </div>

        {uploadError ? <Alert tone="danger">{uploadError}</Alert> : null}
        {mediaQuery.error ? <Alert tone="danger">{mediaQuery.error.message}</Alert> : null}

        {mediaQuery.isLoading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="skeleton aspect-square rounded-lg" />
            ))}
          </div>
        ) : (mediaQuery.data?.items.length ?? 0) === 0 ? (
          <p className="py-10 text-center text-sm text-text-muted">
            No media found. Upload a file to get started.
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {mediaQuery.data?.items.map((media) => {
              const Icon = KIND_ICONS[media.kind] ?? FileText;
              return (
                <li key={media.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(media);
                      onClose();
                    }}
                    className="group w-full overflow-hidden rounded-lg border border-border text-left transition-colors hover:border-primary"
                  >
                    <span className="grid aspect-square place-items-center bg-surface-sunken">
                      {media.kind === 'IMAGE' ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={media.url}
                          alt={media.altText ?? ''}
                          className="size-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <Icon className="size-8 text-text-muted" aria-hidden="true" />
                      )}
                    </span>
                    <span className="block truncate px-2 py-1.5 text-2xs text-text-secondary">
                      {media.originalName}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
}

export function MediaPickerButton({
  onSelect,
  kind,
  label = 'Browse',
}: {
  onSelect: (media: MediaDto) => void;
  kind?: MediaKind;
  label?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        {label}
      </Button>
      <MediaPickerDialog
        open={open}
        onClose={() => setOpen(false)}
        onSelect={onSelect}
        kind={kind}
      />
    </>
  );
}

/** Picker with a preview and a clear action, for form fields. */
export function MediaPickerField({
  currentUrl,
  onSelect,
  kind = 'IMAGE',
  label,
}: {
  currentUrl: string | null;
  onSelect: (media: MediaDto | null) => void;
  kind?: MediaKind;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState(currentUrl);

  return (
    <div className="space-y-3">
      {label ? <p className="text-sm font-medium text-text-primary">{label}</p> : null}

      <div className="overflow-hidden rounded-lg border border-border bg-surface-sunken">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" className="aspect-video w-full object-cover" />
        ) : (
          <div className="grid aspect-video place-items-center text-text-muted" aria-hidden="true">
            <ImageIcon className="size-8" />
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
          {preview ? 'Replace' : 'Choose'}
        </Button>
        {preview ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setPreview(null);
              onSelect(null);
            }}
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
            Remove
          </Button>
        ) : null}
      </div>

      <MediaPickerDialog
        open={open}
        onClose={() => setOpen(false)}
        kind={kind}
        onSelect={(media) => {
          setPreview(media.url);
          onSelect(media);
        }}
      />
    </div>
  );
}

export { api, useApiMutation };
