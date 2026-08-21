'use client';

import { useState } from 'react';
import { FolderTree, Pencil, Plus, Trash2 } from 'lucide-react';
import type { CategoryDto } from '@academy/types';
import { PERMISSIONS } from '@academy/types';
import { api, useApiList, useApiMutation } from '@/lib/api/hooks';
import { cn, colorFromString } from '@/lib/utils';
import { useAuth } from '@/components/providers';
import { Alert, Badge, Button, Card, Checkbox, Input, Select, Textarea } from '@/components/ui';
import { AdminPageHeader, ConfirmDialog, Modal } from './primitives';
import { SortableList } from './sortable-list';
import { MediaPickerField } from './media-picker';

/**
 * Category management.
 *
 * Categories nest one level deep (track → subtrack), which the API enforces.
 * Ordering is drag-and-drop within each level and saved on drop.
 */
export function CategoriesClient({ locale }: { locale: string }) {
  const { can } = useAuth();
  const canManage = can(PERMISSIONS.CATEGORIES_MANAGE);

  const [editing, setEditing] = useState<CategoryDto | null>(null);
  const [creatingUnder, setCreatingUnder] = useState<string | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<CategoryDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  const categoriesQuery = useApiList<CategoryDto>('/admin/categories', {
    tree: true,
    pageSize: 200,
  });
  const categories = categoriesQuery.data?.items ?? [];

  const reorderMutation = useApiMutation(
    (orderedIds: string[]) =>
      api.put('/admin/categories/reorder', {
        items: orderedIds.map((id, index) => ({ id, sortOrder: index })),
      }),
    ['/admin/categories'],
    { onError: (caught) => setError(caught.message) },
  );

  const deleteMutation = useApiMutation(
    (category: CategoryDto) => api.delete(`/admin/categories/${category.id}`),
    ['/admin/categories'],
    { onSuccess: () => setDeleting(null), onError: (caught) => setError(caught.message) },
  );

  return (
    <>
      <AdminPageHeader
        title="Categories"
        description="The tracks courses are grouped into. Two levels deep."
        action={
          canManage ? (
            <Button onClick={() => setCreatingUnder(null)}>
              <Plus className="size-4" aria-hidden="true" />
              New category
            </Button>
          ) : undefined
        }
      />

      {error ? (
        <Alert tone="danger" className="mb-4">
          {error}
        </Alert>
      ) : null}
      {categoriesQuery.error ? (
        <Alert tone="danger" className="mb-4">
          {categoriesQuery.error.message}
        </Alert>
      ) : null}

      {categories.length === 0 && !categoriesQuery.isLoading ? (
        <Card>
          <div className="p-10 text-center">
            <FolderTree className="mx-auto size-8 text-text-muted" aria-hidden="true" />
            <p className="mt-3 text-text-secondary">No categories yet.</p>
          </div>
        </Card>
      ) : (
        <div className="max-w-3xl">
          <SortableList
            items={categories}
            itemLabel={(category) => category.name}
            disabled={!canManage}
            onReorder={(orderedIds) => reorderMutation.mutate(orderedIds)}
            renderItem={(category) => (
              <div className="pr-2">
                <div className="flex items-center gap-3 py-1">
                  <span
                    className="size-3 shrink-0 rounded-full"
                    style={{ backgroundColor: category.colorHex ?? colorFromString(category.slug) }}
                    aria-hidden="true"
                  />

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-text-primary">
                      {category.name}
                    </p>
                    <p className="truncate font-mono text-2xs text-text-muted">/{category.slug}</p>
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    {!category.isActive ? <Badge tone="warning">hidden</Badge> : null}
                    <span className="text-2xs text-text-muted">
                      {category.courseCount} {category.courseCount === 1 ? 'course' : 'courses'}
                    </span>

                    {canManage ? (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setCreatingUnder(category.id)}
                          aria-label={`Add a subcategory under ${category.name}`}
                          title="Add subcategory"
                        >
                          <Plus className="size-3.5" aria-hidden="true" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditing(category)}
                          aria-label={`Edit ${category.name}`}
                        >
                          <Pencil className="size-3.5" aria-hidden="true" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setDeleting(category)}
                          aria-label={`Delete ${category.name}`}
                        >
                          <Trash2 className="size-3.5 text-danger" aria-hidden="true" />
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>

                {category.children && category.children.length > 0 ? (
                  <ul className="ml-6 space-y-1 border-l border-border pl-4">
                    {category.children.map((child) => (
                      <li key={child.id} className="flex items-center gap-3 py-1">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-text-secondary">{child.name}</p>
                          <p className="truncate font-mono text-2xs text-text-muted">
                            /{child.slug}
                          </p>
                        </div>

                        <div className="flex shrink-0 items-center gap-1.5">
                          {!child.isActive ? <Badge tone="warning">hidden</Badge> : null}
                          <span className="text-2xs text-text-muted">{child.courseCount}</span>
                          {canManage ? (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setEditing(child)}
                                aria-label={`Edit ${child.name}`}
                              >
                                <Pencil className="size-3.5" aria-hidden="true" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setDeleting(child)}
                                aria-label={`Delete ${child.name}`}
                              >
                                <Trash2 className="size-3.5 text-danger" aria-hidden="true" />
                              </Button>
                            </>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            )}
          />
        </div>
      )}

      {creatingUnder !== undefined ? (
        <CategoryModal
          parentId={creatingUnder}
          parents={categories}
          onClose={() => setCreatingUnder(undefined)}
        />
      ) : null}

      {editing ? (
        <CategoryModal category={editing} parents={categories} onClose={() => setEditing(null)} />
      ) : null}

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && deleteMutation.mutate(deleting)}
        title={`Delete ${deleting?.name ?? 'category'}`}
        message="Categories that still contain courses or subcategories cannot be deleted — move those first."
        isLoading={deleteMutation.isPending}
      />
    </>
  );
}

function CategoryModal({
  category,
  parentId,
  parents,
  onClose,
}: {
  category?: CategoryDto;
  parentId?: string | null;
  parents: CategoryDto[];
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    name: category?.name ?? '',
    slug: category?.slug ?? '',
    description: category?.description ?? '',
    iconName: category?.iconName ?? '',
    colorHex: category?.colorHex ?? '#1B2CC1',
    parentId: category?.parentId ?? parentId ?? '',
    isActive: category?.isActive ?? true,
    imageMediaId: null as string | null,
  });
  const [error, setError] = useState<string | null>(null);

  const mutation = useApiMutation(
    () => {
      const payload = {
        name: form.name,
        ...(form.slug ? { slug: form.slug } : {}),
        description: form.description || null,
        iconName: form.iconName || null,
        colorHex: form.colorHex || null,
        parentId: form.parentId || null,
        isActive: form.isActive,
        ...(form.imageMediaId !== null ? { imageMediaId: form.imageMediaId } : {}),
      };
      return category
        ? api.patch(`/admin/categories/${category.id}`, payload)
        : api.post('/admin/categories', payload);
    },
    ['/admin/categories'],
    { onSuccess: onClose, onError: (caught) => setError(caught.message) },
  );

  // A category that already has children cannot itself become a child.
  const hasChildren = Boolean(category?.children?.length);

  return (
    <Modal
      open
      onClose={onClose}
      title={category ? `Edit ${category.name}` : 'New category'}
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
            disabled={form.name.trim().length < 2}
          >
            {category ? 'Save category' : 'Create category'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error ? <Alert tone="danger">{error}</Alert> : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Name"
            required
            autoFocus
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
          <Input
            label="URL slug"
            hint="Generated from the name when blank."
            value={form.slug}
            onChange={(event) => setForm({ ...form, slug: event.target.value })}
          />
        </div>

        <Textarea
          label="Description"
          rows={2}
          value={form.description}
          onChange={(event) => setForm({ ...form, description: event.target.value })}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Parent category"
            value={form.parentId}
            disabled={hasChildren}
            hint={
              hasChildren
                ? 'This category has subcategories, so it must stay at the top level.'
                : 'Leave empty for a top-level track.'
            }
            onChange={(event) => setForm({ ...form, parentId: event.target.value })}
            placeholder="Top level"
            options={parents
              .filter((entry) => entry.id !== category?.id && !entry.parentId)
              .map((entry) => ({ value: entry.id, label: entry.name }))}
          />

          <Input
            label="Icon name"
            hint="Any Lucide icon, e.g. Network or ShieldCheck."
            value={form.iconName}
            onChange={(event) => setForm({ ...form, iconName: event.target.value })}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="category-colour" className="text-sm font-medium text-text-primary">
              Accent colour
            </label>
            <div className="flex items-center gap-2">
              <input
                id="category-colour"
                type="color"
                value={form.colorHex}
                onChange={(event) => setForm({ ...form, colorHex: event.target.value })}
                className="h-11 w-14 cursor-pointer rounded-lg border border-border bg-surface"
              />
              <Input
                aria-label="Accent colour hex value"
                value={form.colorHex}
                onChange={(event) => setForm({ ...form, colorHex: event.target.value })}
                containerClassName="flex-1"
              />
            </div>
          </div>

          <MediaPickerField
            label="Category image"
            kind="IMAGE"
            currentUrl={category?.imageUrl ?? null}
            onSelect={(media) => setForm({ ...form, imageMediaId: media?.id ?? null })}
          />
        </div>

        <Checkbox
          label="Active — visible in the public catalogue"
          checked={form.isActive}
          onChange={(event) => setForm({ ...form, isActive: event.target.checked })}
        />
      </div>
    </Modal>
  );
}
