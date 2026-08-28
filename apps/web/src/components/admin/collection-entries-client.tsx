'use client';

import { useState } from 'react';
import { ExternalLink, FileText, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import type { CollectionDto, CollectionEntryDto } from '@academy/types';
import { PERMISSIONS } from '@academy/types';
import { api, useApiList, useApiMutation, useApiResource } from '@/lib/api/hooks';
import { localePath } from '@/lib/i18n/config';
import { useAuth } from '@/components/providers';
import { Alert, Badge, Button, Card, Input, Select } from '@/components/ui';
import { AdminPageHeader, ConfirmDialog, DataTable, TableCell, TableRow } from './primitives';
import { ClientPagination } from './users-client';
import { CollectionEntryEditor } from './collection-entry-editor';

/**
 * One collection's entries.
 *
 * Paginated and searched on the server, unlike the public index — an editor
 * works through hundreds of drafts, and the browser-side filtering that makes
 * the public grid feel instant would mean loading all of them to find one.
 *
 * The filter chips are managed here too rather than on their own screen: they
 * exist only in service of this list, and an editor adding a group is almost
 * always about to file an entry under it.
 */
export function CollectionEntriesClient({
  locale,
  collectionId,
}: {
  locale: string;
  collectionId: string;
}) {
  const { can } = useAuth();
  const canManage = can(PERMISSIONS.COLLECTIONS_MANAGE);

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [editing, setEditing] = useState<CollectionEntryDto | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [deleting, setDeleting] = useState<CollectionEntryDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  const collectionQuery = useApiResource<CollectionDto>(`/admin/collections/${collectionId}`);
  const collection = collectionQuery.data;

  const entriesQuery = useApiList<CollectionEntryDto>(`/admin/collections/${collectionId}/entries`, {
    page,
    pageSize: 20,
    search: search || undefined,
    status: status || undefined,
  });
  const entries = entriesQuery.data?.items ?? [];
  const meta = entriesQuery.data?.meta;

  const deleteMutation = useApiMutation(
    (entry: CollectionEntryDto) => api.delete(`/admin/collection-entries/${entry.id}`),
    [`/admin/collections/${collectionId}/entries`, '/admin/collections'],
    { onSuccess: () => setDeleting(null), onError: (caught) => setError(caught.message) },
  );

  if (collectionQuery.isLoading) {
    return <p className="text-text-secondary">Loading…</p>;
  }
  if (!collection) {
    return <Alert tone="danger">That collection could not be loaded.</Alert>;
  }

  return (
    <>
      <AdminPageHeader
        title={collection.name}
        description={`${collection.entryCount} entries · /reference/${collection.slug}`}
        breadcrumb={{ label: 'Collections', href: localePath(locale, '/admin/collections') }}
        action={
          <div className="flex items-center gap-2">
            {collection.status === 'PUBLISHED' ? (
              <Button
                variant="outline"
                onClick={() =>
                  window.open(localePath(locale, `/reference/${collection.slug}`), '_blank')
                }
              >
                <ExternalLink className="size-4" aria-hidden="true" />
                View
              </Button>
            ) : null}
            {canManage ? (
              <Button onClick={() => setIsCreating(true)}>
                <Plus className="size-4" aria-hidden="true" />
                New entry
              </Button>
            ) : null}
          </div>
        }
      />

      {error ? (
        <Alert tone="danger" className="mb-4">
          {error}
        </Alert>
      ) : null}

      {canManage ? (
        <CategoryManager collection={collection} onError={setError} />
      ) : null}

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Input
          className="min-w-56 flex-1"
          placeholder="Search entries…"
          leadingIcon={<Search className="size-4" />}
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
        <Select
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
          options={[
            { value: '', label: 'Any status' },
            { value: 'DRAFT', label: 'Draft' },
            { value: 'PUBLISHED', label: 'Published' },
            { value: 'ARCHIVED', label: 'Archived' },
          ]}
        />
      </div>

      {entries.length === 0 && !entriesQuery.isLoading ? (
        <Card>
          <div className="p-10 text-center">
            <FileText className="mx-auto size-8 text-text-muted" aria-hidden="true" />
            <p className="mt-3 text-text-secondary">
              {search || status ? 'No entries match those filters.' : 'No entries yet.'}
            </p>
          </div>
        </Card>
      ) : (
        <DataTable headers={['Entry', 'Group', 'Panels', 'Status', '']}>
          {entries.map((entry) => (
            <TableRow key={entry.id}>
              <TableCell>
                <p className="font-medium text-text-primary">
                  {entry.title}
                  {entry.subtitle ? (
                    <span className="text-text-muted"> · {entry.subtitle}</span>
                  ) : null}
                </p>
                <p className="font-mono text-2xs text-text-muted">/{entry.slug}</p>
              </TableCell>
              <TableCell>
                {entry.category ? (
                  <Badge>{entry.category.name}</Badge>
                ) : (
                  <span className="text-2xs text-text-muted">—</span>
                )}
              </TableCell>
              <TableCell>
                <span className="text-2xs text-text-muted">
                  {entry.panels.length} · {entry.facts.length} facts
                </span>
              </TableCell>
              <TableCell>
                <Badge tone={entry.status === 'PUBLISHED' ? 'success' : 'warning'}>
                  {(entry.status ?? 'DRAFT').toLowerCase()}
                </Badge>
              </TableCell>
              <TableCell>
                {canManage ? (
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditing(entry)}
                      aria-label={`Edit ${entry.title}`}
                    >
                      <Pencil className="size-3.5" aria-hidden="true" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDeleting(entry)}
                      aria-label={`Delete ${entry.title}`}
                    >
                      <Trash2 className="size-3.5 text-danger" aria-hidden="true" />
                    </Button>
                  </div>
                ) : null}
              </TableCell>
            </TableRow>
          ))}
        </DataTable>
      )}

      {meta && meta.totalPages > 1 ? (
        <ClientPagination meta={meta} onPageChange={setPage} className="mt-5" />
      ) : null}

      {isCreating || editing ? (
        <CollectionEntryEditor
          collection={collection}
          entry={editing}
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
        title="Delete this entry?"
        message={`“${deleting?.title}” will be removed. Its URL will 404.`}
        isLoading={deleteMutation.isPending}
      />
    </>
  );
}

/**
 * The filter chips above the public grid.
 *
 * Deliberately a strip rather than a screen: a group is a name and an order,
 * and removing one leaves its entries in place and uncategorised — tidying the
 * chips is not a request to delete a hundred documented entries.
 */
function CategoryManager({
  collection,
  onError,
}: {
  collection: CollectionDto;
  onError: (message: string) => void;
}) {
  const [name, setName] = useState('');

  const invalidate = ['/admin/collections', `/admin/collections/${collection.id}`];

  const createMutation = useApiMutation(
    (value: string) => api.post(`/admin/collections/${collection.id}/categories`, { name: value }),
    invalidate,
    { onSuccess: () => setName(''), onError: (caught) => onError(caught.message) },
  );

  const deleteMutation = useApiMutation(
    (id: string) => api.delete(`/admin/collection-categories/${id}`),
    invalidate,
    { onError: (caught) => onError(caught.message) },
  );

  return (
    <Card className="mb-4">
      <div className="space-y-3 p-4">
        <div>
          <p className="text-sm font-medium text-text-primary">Filter groups</p>
          <p className="text-xs text-text-muted">
            The chips above the grid. Visitors filter by these alongside the search box.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {collection.categories.length === 0 ? (
            <span className="text-xs text-text-muted">None yet.</span>
          ) : (
            collection.categories.map((category) => (
              <span
                key={category.id}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-sunken py-0.5 pl-2.5 pr-1 text-xs text-text-secondary"
              >
                {category.name}
                <span className="text-text-muted">({category.entryCount})</span>
                <button
                  type="button"
                  onClick={() => deleteMutation.mutate(category.id)}
                  aria-label={`Remove the ${category.name} filter`}
                  className="rounded-full p-0.5 text-text-muted transition-colors hover:text-danger focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-border-focus"
                >
                  <X className="size-3" aria-hidden="true" />
                </button>
              </span>
            ))
          )}
        </div>

        <div className="flex items-end gap-2">
          <Input
            className="max-w-56"
            aria-label="New filter group"
            placeholder="Remote Access"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && name.trim()) createMutation.mutate(name.trim());
            }}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={name.trim().length === 0}
            isLoading={createMutation.isPending}
            onClick={() => createMutation.mutate(name.trim())}
          >
            <Plus className="size-3.5" aria-hidden="true" />
            Add
          </Button>
        </div>
      </div>
    </Card>
  );
}
