'use client';

import { useState } from 'react';
import Link from 'next/link';
import { BookMarked, Pencil, Plus, Trash2 } from 'lucide-react';
import type { CollectionDto } from '@academy/types';
import { PERMISSIONS } from '@academy/types';
import { api, useApiList, useApiMutation } from '@/lib/api/hooks';
import { localePath } from '@/lib/i18n/config';
import { useAuth } from '@/components/providers';
import { Alert, Badge, Button, Card, Input, Select, Textarea } from '@/components/ui';
import { AdminPageHeader, ConfirmDialog, Modal } from './primitives';

/**
 * Reference collections.
 *
 * A collection is a container and a handful of index-page settings; everything
 * an editor actually spends time on lives one level down, in its entries. So
 * this screen stays a list with a small form, and the row itself is the link
 * into the work.
 */
export function CollectionsClient({ locale }: { locale: string }) {
  const { can } = useAuth();
  const canManage = can(PERMISSIONS.COLLECTIONS_MANAGE);

  const [editing, setEditing] = useState<CollectionDto | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [deleting, setDeleting] = useState<CollectionDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  const collectionsQuery = useApiList<CollectionDto>('/admin/collections', { pageSize: 100 });
  const collections = collectionsQuery.data?.items ?? [];

  const deleteMutation = useApiMutation(
    (collection: CollectionDto) => api.delete(`/admin/collections/${collection.id}`),
    ['/admin/collections'],
    { onSuccess: () => setDeleting(null), onError: (caught) => setError(caught.message) },
  );

  return (
    <>
      <AdminPageHeader
        title="Reference collections"
        description="Encyclopedia-style content: many small entries, one searchable index, a detail page each."
        action={
          canManage ? (
            <Button onClick={() => setIsCreating(true)}>
              <Plus className="size-4" aria-hidden="true" />
              New collection
            </Button>
          ) : undefined
        }
      />

      {error ? (
        <Alert tone="danger" className="mb-4">
          {error}
        </Alert>
      ) : null}
      {collectionsQuery.error ? (
        <Alert tone="danger" className="mb-4">
          {collectionsQuery.error.message}
        </Alert>
      ) : null}

      {collections.length === 0 && !collectionsQuery.isLoading ? (
        <Card>
          <div className="p-10 text-center">
            <BookMarked className="mx-auto size-8 text-text-muted" aria-hidden="true" />
            <p className="mt-3 text-text-secondary">
              No collections yet. A collection is the right shape when you have dozens of similar
              entries — ports, protocols, commands — that each deserve a page.
            </p>
          </div>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {collections.map((collection) => (
            <Card key={collection.id}>
              <div className="flex items-start justify-between gap-3 p-4">
                <Link
                  href={localePath(locale, `/admin/collections/${collection.id}`)}
                  className="min-w-0 flex-1 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
                >
                  <p className="truncate text-sm font-semibold text-text-primary">
                    {collection.name}
                  </p>
                  <p className="truncate font-mono text-2xs text-text-muted">
                    /reference/{collection.slug}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <Badge tone={collection.status === 'PUBLISHED' ? 'success' : 'warning'}>
                      {collection.status.toLowerCase()}
                    </Badge>
                    <span className="text-2xs text-text-muted">
                      {collection.entryCount} {collection.entryCount === 1 ? 'entry' : 'entries'}
                    </span>
                    {collection.categories.length > 0 ? (
                      <span className="text-2xs text-text-muted">
                        · {collection.categories.length} filters
                      </span>
                    ) : null}
                  </div>
                </Link>

                {canManage ? (
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditing(collection)}
                      aria-label={`Edit ${collection.name}`}
                    >
                      <Pencil className="size-3.5" aria-hidden="true" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDeleting(collection)}
                      aria-label={`Delete ${collection.name}`}
                    >
                      <Trash2 className="size-3.5 text-danger" aria-hidden="true" />
                    </Button>
                  </div>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      )}

      {isCreating || editing ? (
        <CollectionForm
          collection={editing}
          onClose={() => {
            setIsCreating(false);
            setEditing(null);
          }}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && deleteMutation.mutate(deleting)}
        title="Delete this collection?"
        message={`“${deleting?.name}” and its ${deleting?.entryCount ?? 0} entries will stop being reachable. Existing links will 404.`}
        isLoading={deleteMutation.isPending}
      />
    </>
  );
}

function CollectionForm({
  collection,
  onClose,
}: {
  collection: CollectionDto | null;
  onClose: () => void;
}) {
  const [name, setName] = useState(collection?.name ?? '');
  const [slug, setSlug] = useState(collection?.slug ?? '');
  const [description, setDescription] = useState(collection?.description ?? '');
  const [eyebrow, setEyebrow] = useState(collection?.eyebrow ?? '');
  const [iconName, setIconName] = useState(collection?.iconName ?? '');
  const [searchPlaceholder, setSearchPlaceholder] = useState(collection?.searchPlaceholder ?? '');
  const [status, setStatus] = useState(collection?.status ?? 'DRAFT');
  const [error, setError] = useState<string | null>(null);

  const mutation = useApiMutation(
    () => {
      const body = {
        name,
        // Left blank on create, the API derives one from the name.
        ...(slug ? { slug } : {}),
        description: description || null,
        eyebrow: eyebrow || null,
        iconName: iconName || null,
        searchPlaceholder: searchPlaceholder || null,
        status,
      };
      return collection
        ? api.patch(`/admin/collections/${collection.id}`, body)
        : api.post('/admin/collections', body);
    },
    ['/admin/collections'],
    { onSuccess: onClose, onError: (caught) => setError(caught.message) },
  );

  return (
    <Modal
      open
      onClose={onClose}
      title={collection ? `Edit ${collection.name}` : 'New collection'}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              setError(null);
              mutation.mutate(undefined as never);
            }}
            isLoading={mutation.isPending}
            disabled={name.trim().length < 2}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error ? <Alert tone="danger">{error}</Alert> : null}

        <Input
          label="Name"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Port Encyclopedia"
        />

        <Input
          label="URL slug"
          hint={`The index lives at /reference/${slug || 'your-slug'}. Leave blank to derive it from the name.`}
          value={slug}
          onChange={(event) => setSlug(event.target.value)}
          placeholder="ports"
        />

        <Textarea
          label="Description"
          rows={2}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Comprehensive guide to TCP/UDP network ports, their services and known risks."
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Eyebrow"
            hint="Small label above the index heading."
            value={eyebrow}
            onChange={(event) => setEyebrow(event.target.value)}
            placeholder="Network ports database"
          />
          <Input
            label="Lucide icon name"
            hint="Shown beside the eyebrow."
            value={iconName}
            onChange={(event) => setIconName(event.target.value)}
            placeholder="Network"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Search placeholder"
            value={searchPlaceholder}
            onChange={(event) => setSearchPlaceholder(event.target.value)}
            placeholder="Search by port number or service name…"
          />
          <Select
            label="Status"
            value={status}
            onChange={(event) => setStatus(event.target.value as typeof status)}
            options={[
              { value: 'DRAFT', label: 'Draft — not reachable' },
              { value: 'PUBLISHED', label: 'Published' },
              { value: 'ARCHIVED', label: 'Archived' },
            ]}
          />
        </div>
      </div>
    </Modal>
  );
}
