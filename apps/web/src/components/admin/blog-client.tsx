'use client';

import { useState } from 'react';
import { Loader2, Newspaper, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import type { BlogPostCardDto, BlogPostDto, RichTextDocument } from '@academy/types';
import { PERMISSIONS } from '@academy/types';
import { api, useApiList, useApiMutation, useApiResource } from '@/lib/api/hooks';
import { formatDate } from '@/lib/utils';
import { useAuth } from '@/components/providers';
import { Alert, Badge, Button, Checkbox, Input, Select, Textarea } from '@/components/ui';
import {
  AdminPageHeader,
  ConfirmDialog,
  DataTable,
  Modal,
  TableCell,
  TableRow,
} from './primitives';
import { ClientPagination } from './users-client';
import { RichTextEditor } from './rich-text-editor';
import { MediaPickerField } from './media-picker';
import { SeoFields, emptySeoForm, toSeoPayload, type SeoFormValue } from './seo-fields';

export function BlogClient({ locale }: { locale: string }) {
  const { can } = useAuth();
  const canManage = can(PERMISSIONS.BLOG_MANAGE);

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<BlogPostCardDto | null>(null);

  const postsQuery = useApiList<BlogPostCardDto>('/admin/blog', {
    page,
    pageSize: 20,
    search: search || undefined,
    status: status || undefined,
  });

  const deleteMutation = useApiMutation(
    (post: BlogPostCardDto) => api.delete(`/admin/blog/${post.id}`),
    ['/admin/blog'],
    { onSuccess: () => setDeleting(null) },
  );

  return (
    <>
      <AdminPageHeader
        title="Articles"
        description="Long-form posts published to the public blog."
        action={
          canManage ? (
            <Button onClick={() => setCreating(true)}>
              <Plus className="size-4" aria-hidden="true" />
              New article
            </Button>
          ) : undefined
        }
      />

      <div className="mb-5 flex flex-col gap-3 sm:flex-row">
        <Input
          type="search"
          placeholder="Search articles…"
          aria-label="Search articles"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          leadingIcon={<Search className="size-4" />}
          containerClassName="flex-1"
        />
        <Select
          aria-label="Filter by status"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
          placeholder="All statuses"
          options={[
            { value: 'PUBLISHED', label: 'Published' },
            { value: 'DRAFT', label: 'Draft' },
            { value: 'ARCHIVED', label: 'Archived' },
          ]}
          containerClassName="sm:w-48"
        />
      </div>

      {postsQuery.error ? (
        <Alert tone="danger" className="mb-4">
          {postsQuery.error.message}
        </Alert>
      ) : null}

      <DataTable
        headers={['Article', 'Status', 'Author', 'Published', '']}
        isLoading={postsQuery.isLoading}
        isEmpty={(postsQuery.data?.items.length ?? 0) === 0}
        emptyMessage="No articles yet."
      >
        {postsQuery.data?.items.map((post) => (
          <TableRow key={post.id}>
            <TableCell>
              <div className="min-w-0">
                <p className="truncate font-medium text-text-primary">{post.title}</p>
                <p className="truncate font-mono text-2xs text-text-muted">/{post.slug}</p>
              </div>
            </TableCell>

            <TableCell>
              <Badge tone={post.status === 'PUBLISHED' ? 'success' : 'warning'}>
                {post.status.toLowerCase()}
              </Badge>
            </TableCell>

            <TableCell className="text-xs">{post.author?.name ?? '—'}</TableCell>

            <TableCell className="whitespace-nowrap text-xs">
              {post.publishedAt ? formatDate(post.publishedAt, locale) : '—'}
            </TableCell>

            <TableCell align="right">
              {canManage ? (
                <div className="flex justify-end gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditingId(post.id)}
                    aria-label={`Edit ${post.title}`}
                  >
                    <Pencil className="size-3.5" aria-hidden="true" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setDeleting(post)}
                    aria-label={`Delete ${post.title}`}
                  >
                    <Trash2 className="size-3.5 text-danger" aria-hidden="true" />
                  </Button>
                </div>
              ) : null}
            </TableCell>
          </TableRow>
        ))}
      </DataTable>

      {postsQuery.data?.meta && postsQuery.data.meta.totalPages > 1 ? (
        <ClientPagination meta={postsQuery.data.meta} onPageChange={setPage} className="mt-5" />
      ) : null}

      {creating ? <PostEditorModal onClose={() => setCreating(false)} /> : null}
      {editingId ? (
        <PostEditorModal postId={editingId} onClose={() => setEditingId(null)} />
      ) : null}

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && deleteMutation.mutate(deleting)}
        title={`Delete ${deleting?.title ?? 'article'}`}
        message="The article is archived and removed from the public blog."
        confirmLabel="Archive"
        isLoading={deleteMutation.isPending}
      />
    </>
  );
}

function PostEditorModal({ postId, onClose }: { postId?: string; onClose: () => void }) {
  const isEditing = Boolean(postId);
  const postQuery = useApiResource<BlogPostDto>(postId ? `/admin/blog/${postId}` : null);

  const [tab, setTab] = useState<'content' | 'seo'>('content');
  const [form, setForm] = useState({
    title: '',
    slug: '',
    excerpt: '',
    body: { type: 'doc', content: [] } as RichTextDocument,
    tags: '',
    status: 'DRAFT',
    coverMediaId: null as string | null,
  });
  const [seo, setSeo] = useState<SeoFormValue>(() => emptySeoForm(null));
  const [isHydrated, setIsHydrated] = useState(!isEditing);
  const [error, setError] = useState<string | null>(null);

  if (postQuery.data && !isHydrated) {
    const post = postQuery.data;
    setForm({
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt ?? '',
      body: post.body ?? { type: 'doc', content: [] },
      tags: post.tags.join(', '),
      status: post.status,
      coverMediaId: null,
    });
    setSeo(emptySeoForm(post.seo));
    setIsHydrated(true);
  }

  const mutation = useApiMutation(
    () => {
      const payload = {
        title: form.title,
        ...(form.slug ? { slug: form.slug } : {}),
        excerpt: form.excerpt || null,
        body: form.body,
        tags: form.tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
        status: form.status,
        seo: toSeoPayload(seo),
        ...(form.coverMediaId !== null ? { coverMediaId: form.coverMediaId } : {}),
      };
      return postId
        ? api.patch(`/admin/blog/${postId}`, payload)
        : api.post('/admin/blog', payload);
    },
    ['/admin/blog'],
    { onSuccess: onClose, onError: (caught) => setError(caught.message) },
  );

  const isLoading = isEditing && postQuery.isLoading;

  return (
    <Modal
      open
      onClose={onClose}
      title={isEditing ? 'Edit article' : 'New article'}
      size="xl"
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
            disabled={isLoading || form.title.trim().length < 3}
          >
            Save article
          </Button>
        </>
      }
    >
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="size-6 animate-spin text-text-muted" aria-hidden="true" />
          <span className="sr-only">Loading article</span>
        </div>
      ) : (
        <div className="space-y-5">
          {error ? <Alert tone="danger">{error}</Alert> : null}

          <div className="flex gap-1 border-b border-border">
            {(['content', 'seo'] as const).map((entry) => (
              <button
                key={entry}
                type="button"
                onClick={() => setTab(entry)}
                aria-current={tab === entry ? 'page' : undefined}
                className={
                  tab === entry
                    ? '-mb-px border-b-2 border-primary px-4 py-2 text-sm font-medium text-primary'
                    : '-mb-px border-b-2 border-transparent px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary'
                }
              >
                {entry === 'content' ? 'Content' : 'SEO'}
              </button>
            ))}
          </div>

          {tab === 'content' ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Title"
                  required
                  autoFocus
                  value={form.title}
                  onChange={(event) => setForm({ ...form, title: event.target.value })}
                />
                <Input
                  label="URL slug"
                  hint="Generated from the title when blank."
                  value={form.slug}
                  onChange={(event) => setForm({ ...form, slug: event.target.value })}
                />
              </div>

              <Textarea
                label="Excerpt"
                rows={2}
                hint="Shown on the article card and used as the fallback meta description."
                value={form.excerpt}
                onChange={(event) => setForm({ ...form, excerpt: event.target.value })}
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Tags"
                  hint="Comma separated."
                  value={form.tags}
                  onChange={(event) => setForm({ ...form, tags: event.target.value })}
                />
                <Select
                  label="Status"
                  value={form.status}
                  onChange={(event) => setForm({ ...form, status: event.target.value })}
                  options={[
                    { value: 'DRAFT', label: 'Draft' },
                    { value: 'PUBLISHED', label: 'Published' },
                    { value: 'ARCHIVED', label: 'Archived' },
                  ]}
                />
              </div>

              <MediaPickerField
                label="Cover image"
                kind="IMAGE"
                currentUrl={postQuery.data?.coverImageUrl ?? null}
                onSelect={(media) => setForm({ ...form, coverMediaId: media?.id ?? null })}
              />

              <div>
                <p className="mb-2 text-sm font-medium text-text-primary">Article body</p>
                <RichTextEditor
                  value={form.body}
                  onChange={(document) => setForm({ ...form, body: document })}
                  minBlocks={0}
                />
              </div>
            </>
          ) : (
            <SeoFields
              value={seo}
              onChange={setSeo}
              previewTitle={form.title}
              previewPath={`/blog/${form.slug || 'article-slug'}`}
            />
          )}
        </div>
      )}
    </Modal>
  );
}
