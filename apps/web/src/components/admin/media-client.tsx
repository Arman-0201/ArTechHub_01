'use client';

import { useState } from 'react';
import { FileText, ImageIcon, Search, Trash2, Upload, Video } from 'lucide-react';
import type { MediaDto } from '@academy/types';
import { PERMISSIONS } from '@academy/types';
import { api, apiFetch, useApiList, useApiMutation } from '@/lib/api/hooks';
import { formatDate } from '@/lib/utils';
import { useAuth } from '@/components/providers';
import { Alert, Badge, Button, Card, Input, Select } from '@/components/ui';
import { AdminPageHeader, ConfirmDialog, Modal } from './primitives';
import { ClientPagination } from './users-client';

const KIND_ICONS: Record<string, typeof ImageIcon> = {
  IMAGE: ImageIcon,
  VIDEO: Video,
  DOCUMENT: FileText,
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Media library.
 *
 * Uploads are validated server-side by magic bytes rather than by the declared
 * content type, and deletion is refused while anything still references a file
 * — so removing an image can never silently break a course page.
 */
export function MediaClient({ locale }: { locale: string }) {
  const { can } = useAuth();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('');
  const [selected, setSelected] = useState<MediaDto | null>(null);
  const [deleting, setDeleting] = useState<MediaDto | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const mediaQuery = useApiList<MediaDto>('/admin/media', {
    page,
    pageSize: 24,
    search: search || undefined,
    kind: kind || undefined,
  });

  const deleteMutation = useApiMutation(
    (media: MediaDto) => api.delete(`/admin/media/${media.id}`),
    ['/admin/media'],
    {
      onSuccess: () => {
        setDeleting(null);
        setDeleteError(null);
        setSelected(null);
      },
      onError: (error) => setDeleteError(error.message),
    },
  );

  const canUpload = can(PERMISSIONS.MEDIA_UPLOAD);
  const canDelete = can(PERMISSIONS.MEDIA_DELETE);

  async function upload(files: FileList) {
    setUploadError(null);
    setIsUploading(true);
    try {
      // Sequential rather than parallel: the rate limiter is per-hour and a
      // burst of twenty parallel uploads would trip it needlessly.
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append('file', file);
        await apiFetch<MediaDto>('/admin/media', { method: 'POST', body: formData });
      }
      await mediaQuery.refetch();
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Upload failed.');
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <>
      <AdminPageHeader
        title="Media library"
        description="Images, video and documents used across the platform."
        action={
          canUpload ? (
            <label className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-text-on-primary transition-colors hover:bg-primary-hover">
              <Upload className="size-4" aria-hidden="true" />
              {isUploading ? 'Uploading…' : 'Upload'}
              <input
                type="file"
                multiple
                className="sr-only"
                disabled={isUploading}
                onChange={(event) => {
                  if (event.target.files?.length) void upload(event.target.files);
                  event.target.value = '';
                }}
              />
            </label>
          ) : undefined
        }
      />

      {uploadError ? (
        <Alert tone="danger" className="mb-4">
          {uploadError}
        </Alert>
      ) : null}
      {mediaQuery.error ? (
        <Alert tone="danger" className="mb-4">
          {mediaQuery.error.message}
        </Alert>
      ) : null}

      <div className="mb-5 flex flex-col gap-3 sm:flex-row">
        <Input
          type="search"
          placeholder="Search by filename or alt text…"
          aria-label="Search media"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          leadingIcon={<Search className="size-4" />}
          containerClassName="flex-1"
        />
        <Select
          aria-label="Filter by type"
          value={kind}
          onChange={(event) => {
            setKind(event.target.value);
            setPage(1);
          }}
          placeholder="All types"
          options={[
            { value: 'IMAGE', label: 'Images' },
            { value: 'VIDEO', label: 'Video' },
            { value: 'DOCUMENT', label: 'Documents' },
            { value: 'AUDIO', label: 'Audio' },
          ]}
          containerClassName="sm:w-48"
        />
      </div>

      {mediaQuery.isLoading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 12 }).map((_, index) => (
            <div key={index} className="skeleton aspect-square rounded-xl" />
          ))}
        </div>
      ) : (mediaQuery.data?.items.length ?? 0) === 0 ? (
        <Card>
          <div className="p-14 text-center">
            <ImageIcon className="mx-auto size-8 text-text-muted" aria-hidden="true" />
            <p className="mt-3 text-text-secondary">No media matches these filters.</p>
          </div>
        </Card>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {mediaQuery.data?.items.map((media) => {
            const Icon = KIND_ICONS[media.kind] ?? FileText;
            return (
              <li key={media.id}>
                <button
                  type="button"
                  onClick={() => setSelected(media)}
                  className="w-full overflow-hidden rounded-xl border border-border bg-surface text-left transition-colors hover:border-primary"
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
                  <span className="block px-2.5 py-2">
                    <span className="block truncate text-xs font-medium text-text-primary">
                      {media.originalName}
                    </span>
                    <span className="block text-2xs text-text-muted">
                      {formatBytes(media.sizeBytes)}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {mediaQuery.data?.meta && mediaQuery.data.meta.totalPages > 1 ? (
        <ClientPagination meta={mediaQuery.data.meta} onPageChange={setPage} className="mt-6" />
      ) : null}

      {selected ? (
        <MediaDetailModal
          media={selected}
          locale={locale}
          canDelete={canDelete}
          canUpdate={canUpload}
          onClose={() => setSelected(null)}
          onDelete={() => setDeleting(selected)}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => {
          setDeleting(null);
          setDeleteError(null);
        }}
        onConfirm={() => deleting && deleteMutation.mutate(deleting)}
        title="Delete file"
        message={
          deleteError ??
          'The file is removed from storage. Files still referenced by a course, page or product cannot be deleted.'
        }
        isLoading={deleteMutation.isPending}
      />
    </>
  );
}

function MediaDetailModal({
  media,
  locale,
  canDelete,
  canUpdate,
  onClose,
  onDelete,
}: {
  media: MediaDto;
  locale: string;
  canDelete: boolean;
  canUpdate: boolean;
  onClose: () => void;
  onDelete: () => void;
}) {
  const [altText, setAltText] = useState(media.altText ?? '');
  const [folder, setFolder] = useState(media.folder ?? '');
  const [saved, setSaved] = useState(false);

  const mutation = useApiMutation(
    () => api.patch(`/admin/media/${media.id}`, { altText: altText || null, folder: folder || null }),
    ['/admin/media'],
    { onSuccess: () => setSaved(true) },
  );

  return (
    <Modal
      open
      onClose={onClose}
      title={media.originalName}
      size="lg"
      footer={
        <>
          {canDelete ? (
            <Button variant="ghost" onClick={onDelete} className="mr-auto">
              <Trash2 className="size-4 text-danger" aria-hidden="true" />
              Delete
            </Button>
          ) : null}
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          {canUpdate ? (
            <Button onClick={() => mutation.mutate(undefined as never)} isLoading={mutation.isPending}>
              Save details
            </Button>
          ) : null}
        </>
      }
    >
      <div className="space-y-5">
        {saved ? <Alert tone="success">Details saved.</Alert> : null}

        <div className="overflow-hidden rounded-lg border border-border bg-surface-sunken">
          {media.kind === 'IMAGE' ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={media.url} alt={media.altText ?? ''} className="max-h-72 w-full object-contain" />
          ) : media.kind === 'VIDEO' ? (
            <video src={media.url} controls className="max-h-72 w-full" preload="metadata" />
          ) : (
            <div className="grid h-40 place-items-center">
              <FileText className="size-10 text-text-muted" aria-hidden="true" />
            </div>
          )}
        </div>

        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-text-muted">Type</dt>
            <dd className="flex items-center gap-2 text-text-primary">
              <Badge tone="neutral">{media.kind.toLowerCase()}</Badge>
              <span className="font-mono text-2xs">{media.mimeType}</span>
            </dd>
          </div>
          <div>
            <dt className="text-text-muted">Size</dt>
            <dd className="text-text-primary">{formatBytes(media.sizeBytes)}</dd>
          </div>
          {media.width && media.height ? (
            <div>
              <dt className="text-text-muted">Dimensions</dt>
              <dd className="text-text-primary">
                {media.width} × {media.height}
              </dd>
            </div>
          ) : null}
          <div>
            <dt className="text-text-muted">Uploaded</dt>
            <dd className="text-text-primary">
              {formatDate(media.createdAt, locale)}
              {media.uploadedBy ? ` by ${media.uploadedBy.name}` : ''}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-text-muted">URL</dt>
            <dd className="truncate font-mono text-2xs text-text-secondary">{media.url}</dd>
          </div>
        </dl>

        {canUpdate ? (
          <div className="space-y-4 border-t border-border pt-4">
            <Input
              label="Alt text"
              hint="Describes the image for screen readers and when it fails to load."
              value={altText}
              onChange={(event) => {
                setAltText(event.target.value);
                setSaved(false);
              }}
            />
            <Input
              label="Folder"
              hint="Lowercase letters, numbers, slashes and dashes."
              value={folder}
              onChange={(event) => {
                setFolder(event.target.value);
                setSaved(false);
              }}
            />
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
