'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, Lock, Pencil, Plus, Trash2 } from 'lucide-react';
import type { PageDto } from '@academy/types';
import { PERMISSIONS } from '@academy/types';
import { api, useApiList, useApiMutation } from '@/lib/api/hooks';
import { localePath } from '@/lib/i18n/config';
import { formatDate } from '@/lib/utils';
import { useAuth } from '@/components/providers';
import { Alert, Badge, Button, Input, Select } from '@/components/ui';
import {
  AdminPageHeader,
  ConfirmDialog,
  DataTable,
  Modal,
  TableCell,
  TableRow,
} from './primitives';

export function PagesClient({ locale }: { locale: string }) {
  const router = useRouter();
  const { can } = useAuth();

  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<PageDto | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const pagesQuery = useApiList<PageDto>('/admin/pages', { pageSize: 50 });

  const deleteMutation = useApiMutation(
    (page: PageDto) => api.delete(`/admin/pages/${page.id}`),
    ['/admin/pages'],
    {
      onSuccess: () => {
        setDeleting(null);
        setDeleteError(null);
      },
      onError: (error) => setDeleteError(error.message),
    },
  );

  const canCreate = can(PERMISSIONS.PAGES_CREATE);
  const canUpdate = can(PERMISSIONS.PAGES_UPDATE);
  const canDelete = can(PERMISSIONS.PAGES_DELETE);

  return (
    <>
      <AdminPageHeader
        title="Pages"
        description="Every public page is built from reorderable sections — no code required."
        action={
          canCreate ? (
            <Button onClick={() => setCreating(true)}>
              <Plus className="size-4" aria-hidden="true" />
              New page
            </Button>
          ) : undefined
        }
      />

      {pagesQuery.error ? (
        <Alert tone="danger" className="mb-4">
          {pagesQuery.error.message}
        </Alert>
      ) : null}

      <DataTable
        headers={['Page', 'Status', 'Sections', 'Updated', '']}
        isLoading={pagesQuery.isLoading}
        isEmpty={(pagesQuery.data?.items.length ?? 0) === 0}
        emptyMessage="No pages yet."
      >
        {pagesQuery.data?.items.map((page) => (
          <TableRow key={page.id}>
            <TableCell>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Link
                    href={localePath(locale, `/admin/pages/${page.id}`)}
                    className="truncate font-medium text-text-primary transition-colors hover:text-primary"
                  >
                    {page.title}
                  </Link>
                  {page.isSystem ? (
                    <span title="System page — cannot be deleted">
                      <Lock className="size-3 shrink-0 text-text-muted" aria-hidden="true" />
                      <span className="sr-only">System page</span>
                    </span>
                  ) : null}
                </div>
                <p className="truncate font-mono text-2xs text-text-muted">/{page.slug}</p>
              </div>
            </TableCell>

            <TableCell>
              <div className="flex flex-wrap gap-1">
                <Badge tone={page.status === 'PUBLISHED' ? 'success' : 'warning'}>
                  {page.status.toLowerCase()}
                </Badge>
                {!page.isEnabled ? <Badge tone="danger">disabled</Badge> : null}
              </div>
            </TableCell>

            <TableCell className="text-xs">{page.sections.length}</TableCell>

            <TableCell className="whitespace-nowrap text-xs">
              {formatDate(page.updatedAt, locale)}
            </TableCell>

            <TableCell align="right">
              <div className="flex justify-end gap-1">
                {page.status === 'PUBLISHED' && page.isEnabled ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    href={localePath(locale, page.slug === 'home' ? '/' : `/${page.slug}`)}
                    aria-label={`View ${page.title}`}
                  >
                    <Eye className="size-3.5" aria-hidden="true" />
                  </Button>
                ) : null}
                {canUpdate ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    href={localePath(locale, `/admin/pages/${page.id}`)}
                    aria-label={`Edit ${page.title}`}
                  >
                    <Pencil className="size-3.5" aria-hidden="true" />
                  </Button>
                ) : null}
                {canDelete && !page.isSystem ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setDeleting(page)}
                    aria-label={`Delete ${page.title}`}
                  >
                    <Trash2 className="size-3.5 text-danger" aria-hidden="true" />
                  </Button>
                ) : null}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </DataTable>

      {creating ? (
        <CreatePageModal
          onClose={() => setCreating(false)}
          onCreated={(id) => router.push(localePath(locale, `/admin/pages/${id}`))}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => {
          setDeleting(null);
          setDeleteError(null);
        }}
        onConfirm={() => deleting && deleteMutation.mutate(deleting)}
        title={`Delete ${deleting?.title ?? 'page'}`}
        message={
          deleteError ??
          'The page and its sections are removed from the site. System pages can only be disabled.'
        }
        isLoading={deleteMutation.isPending}
      />
    </>
  );
}

function CreatePageModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [form, setForm] = useState({ title: '', slug: '', template: 'default' });
  const [error, setError] = useState<string | null>(null);

  const mutation = useApiMutation(
    () =>
      api.post<{ id: string }>('/admin/pages', {
        title: form.title,
        ...(form.slug ? { slug: form.slug } : {}),
        template: form.template,
        status: 'DRAFT',
      }),
    ['/admin/pages'],
    { onSuccess: (page) => onCreated(page.id), onError: (caught) => setError(caught.message) },
  );

  return (
    <Modal
      open
      onClose={onClose}
      title="New page"
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
            disabled={form.title.trim().length < 2}
          >
            Create and edit
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error ? <Alert tone="danger">{error}</Alert> : null}

        <Input
          label="Page title"
          required
          autoFocus
          value={form.title}
          onChange={(event) => setForm({ ...form, title: event.target.value })}
        />
        <Input
          label="URL slug"
          hint="Generated from the title when blank. The page will live at /{locale}/{slug}."
          value={form.slug}
          onChange={(event) => setForm({ ...form, slug: event.target.value })}
        />
        <Select
          label="Template"
          value={form.template}
          onChange={(event) => setForm({ ...form, template: event.target.value })}
          options={[
            { value: 'default', label: 'Default' },
            { value: 'landing', label: 'Landing page' },
            { value: 'legal', label: 'Legal / long form' },
            { value: 'full-width', label: 'Full width' },
          ]}
        />
      </div>
    </Modal>
  );
}
