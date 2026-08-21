'use client';

import { useState } from 'react';
import { ExternalLink, Eye, EyeOff, Pencil, Plus, Trash2 } from 'lucide-react';
import type { MenuItemDto, RoleDto } from '@academy/types';
import { LOCALES, PERMISSIONS } from '@academy/types';
import { api, useApiList, useApiMutation, useApiResource } from '@/lib/api/hooks';
import { cn } from '@/lib/utils';
import { useAuth } from '@/components/providers';
import { Alert, Badge, Button, Card, Checkbox, Input, Select } from '@/components/ui';
import { AdminPageHeader, ConfirmDialog, Modal } from './primitives';
import { SortableList } from './sortable-list';
import { FooterEditor } from './footer-editor';

const MENUS = [
  { slug: 'header', label: 'Header navigation' },
  { slug: 'footer', label: 'Footer navigation' },
];

/**
 * Navigation editor.
 *
 * Items are reordered by drag-and-drop and can be nested one level. Visibility
 * rules (per role, per locale) are applied by the API when it builds the menu,
 * so a staff-only item never reaches an anonymous visitor's browser at all.
 */
export function MenusClient() {
  const { can } = useAuth();
  const canManage = can(PERMISSIONS.MENUS_MANAGE);

  const [menuSlug, setMenuSlug] = useState('header');
  const [editing, setEditing] = useState<MenuItemDto | null>(null);
  const [creatingUnder, setCreatingUnder] = useState<string | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<MenuItemDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  const itemsQuery = useApiResource<MenuItemDto[]>(`/admin/menus/${menuSlug}/items`);
  const rolesQuery = useApiList<RoleDto>('/admin/roles');

  const items = itemsQuery.data ?? [];
  const invalidate = [`/admin/menus/${menuSlug}/items`, '/site/bootstrap'];

  /**
   * Reordering sends the whole tree. Children keep their parent; only the
   * top-level order changes here, which is what the drag interaction offers.
   */
  const reorderMutation = useApiMutation(
    (orderedIds: string[]) => {
      const payload = [
        ...orderedIds.map((id, index) => ({ id, parentId: null, sortOrder: index })),
        ...items.flatMap((parent) =>
          parent.children.map((child, index) => ({
            id: child.id,
            parentId: parent.id,
            sortOrder: index,
          })),
        ),
      ];
      return api.put(`/admin/menus/${menuSlug}/reorder`, { items: payload });
    },
    invalidate,
    { onError: (caught) => setError(caught.message) },
  );

  const toggleMutation = useApiMutation(
    (item: MenuItemDto) => api.patch(`/admin/menu-items/${item.id}`, { isVisible: !item.isVisible }),
    invalidate,
    { onError: (caught) => setError(caught.message) },
  );

  const deleteMutation = useApiMutation(
    (item: MenuItemDto) => api.delete(`/admin/menu-items/${item.id}`),
    invalidate,
    { onSuccess: () => setDeleting(null), onError: (caught) => setError(caught.message) },
  );

  return (
    <>
      <AdminPageHeader
        title="Navigation"
        description="Menus and footer links, editable without touching code."
        action={
          canManage ? (
            <Button onClick={() => setCreatingUnder(null)}>
              <Plus className="size-4" aria-hidden="true" />
              Add item
            </Button>
          ) : undefined
        }
      />

      {error ? (
        <Alert tone="danger" className="mb-4">
          {error}
        </Alert>
      ) : null}

      <div className="mb-5 flex gap-1 border-b border-border">
        {MENUS.map((menu) => (
          <button
            key={menu.slug}
            type="button"
            onClick={() => setMenuSlug(menu.slug)}
            aria-current={menuSlug === menu.slug ? 'page' : undefined}
            className={cn(
              '-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
              menuSlug === menu.slug
                ? 'border-primary text-primary'
                : 'border-transparent text-text-secondary hover:text-text-primary',
            )}
          >
            {menu.label}
          </button>
        ))}
      </div>

      <div className="max-w-3xl space-y-6">
        {items.length === 0 && !itemsQuery.isLoading ? (
          <Card>
            <div className="p-10 text-center">
              <p className="text-text-secondary">This menu has no items yet.</p>
            </div>
          </Card>
        ) : (
          <SortableList
            items={items}
            itemLabel={(item) => item.label}
            disabled={!canManage}
            onReorder={(orderedIds) => reorderMutation.mutate(orderedIds)}
            renderItem={(item) => (
              <div className="pr-2">
                <MenuRow
                  item={item}
                  canManage={canManage}
                  onEdit={() => setEditing(item)}
                  onToggle={() => toggleMutation.mutate(item)}
                  onDelete={() => setDeleting(item)}
                  onAddChild={() => setCreatingUnder(item.id)}
                />

                {item.children.length > 0 ? (
                  <ul className="ml-4 space-y-1 border-l border-border pl-4">
                    {item.children.map((child) => (
                      <li key={child.id}>
                        <MenuRow
                          item={child}
                          canManage={canManage}
                          isChild
                          onEdit={() => setEditing(child)}
                          onToggle={() => toggleMutation.mutate(child)}
                          onDelete={() => setDeleting(child)}
                        />
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            )}
          />
        )}

        {menuSlug === 'footer' ? <FooterEditor canManage={canManage} /> : null}
      </div>

      {creatingUnder !== undefined ? (
        <MenuItemModal
          menuSlug={menuSlug}
          parentId={creatingUnder}
          roles={rolesQuery.data?.items ?? []}
          onClose={() => setCreatingUnder(undefined)}
        />
      ) : null}

      {editing ? (
        <MenuItemModal
          menuSlug={menuSlug}
          item={editing}
          roles={rolesQuery.data?.items ?? []}
          onClose={() => setEditing(null)}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && deleteMutation.mutate(deleting)}
        title={`Delete ${deleting?.label ?? 'item'}`}
        message="The item and any sub-items beneath it are removed from the menu."
        isLoading={deleteMutation.isPending}
      />
    </>
  );
}

function MenuRow({
  item,
  canManage,
  isChild,
  onEdit,
  onToggle,
  onDelete,
  onAddChild,
}: {
  item: MenuItemDto;
  canManage: boolean;
  isChild?: boolean;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
  onAddChild?: () => void;
}) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'flex items-center gap-1.5 truncate text-sm',
            item.isVisible ? 'font-medium text-text-primary' : 'text-text-muted line-through',
            isChild && 'font-normal text-text-secondary',
          )}
        >
          {item.label}
          {item.target === '_blank' ? (
            <ExternalLink className="size-3 shrink-0 text-text-muted" aria-hidden="true" />
          ) : null}
        </p>
        <p className="truncate font-mono text-2xs text-text-muted">{item.url}</p>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {item.visibleForRoles.length > 0 ? (
          <Badge tone="primary" title={item.visibleForRoles.join(', ')}>
            {item.visibleForRoles.length} role{item.visibleForRoles.length === 1 ? '' : 's'}
          </Badge>
        ) : null}
        {item.visibleForLocales.length > 0 ? (
          <Badge tone="accent">{item.visibleForLocales.join(', ')}</Badge>
        ) : null}

        {canManage ? (
          <>
            <Button size="sm" variant="ghost" onClick={onToggle} aria-label="Toggle visibility">
              {item.isVisible ? (
                <Eye className="size-3.5" aria-hidden="true" />
              ) : (
                <EyeOff className="size-3.5" aria-hidden="true" />
              )}
            </Button>
            {onAddChild ? (
              <Button size="sm" variant="ghost" onClick={onAddChild} aria-label="Add a sub-item">
                <Plus className="size-3.5" aria-hidden="true" />
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" onClick={onEdit} aria-label={`Edit ${item.label}`}>
              <Pencil className="size-3.5" aria-hidden="true" />
            </Button>
            <Button size="sm" variant="ghost" onClick={onDelete} aria-label={`Delete ${item.label}`}>
              <Trash2 className="size-3.5 text-danger" aria-hidden="true" />
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}

function MenuItemModal({
  menuSlug,
  item,
  parentId,
  roles,
  onClose,
}: {
  menuSlug: string;
  item?: MenuItemDto;
  parentId?: string | null;
  roles: RoleDto[];
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    label: item?.label ?? '',
    url: item?.url ?? '/',
    linkType: item?.linkType ?? 'INTERNAL',
    target: item?.target ?? '_self',
    iconName: item?.iconName ?? '',
    isVisible: item?.isVisible ?? true,
    visibleForRoles: item?.visibleForRoles ?? [],
    visibleForLocales: item?.visibleForLocales ?? [],
  });
  const [error, setError] = useState<string | null>(null);

  const mutation = useApiMutation(
    () => {
      const payload = {
        label: form.label,
        url: form.url,
        linkType: form.linkType,
        target: form.target,
        iconName: form.iconName || null,
        isVisible: form.isVisible,
        visibleForRoles: form.visibleForRoles,
        visibleForLocales: form.visibleForLocales,
        ...(item ? {} : { parentId: parentId ?? null }),
      };
      return item
        ? api.patch(`/admin/menu-items/${item.id}`, payload)
        : api.post(`/admin/menus/${menuSlug}/items`, payload);
    },
    [`/admin/menus/${menuSlug}/items`, '/site/bootstrap'],
    { onSuccess: onClose, onError: (caught) => setError(caught.message) },
  );

  function toggleInList(list: string[], value: string): string[] {
    return list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value];
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={item ? `Edit ${item.label}` : 'New menu item'}
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
            disabled={!form.label.trim() || !form.url.trim()}
          >
            {item ? 'Save item' : 'Add item'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error ? <Alert tone="danger">{error}</Alert> : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Label"
            required
            autoFocus
            value={form.label}
            onChange={(event) => setForm({ ...form, label: event.target.value })}
          />
          <Input
            label="Target"
            required
            hint="A site path like /courses, or a full https:// URL."
            value={form.url}
            onChange={(event) => setForm({ ...form, url: event.target.value })}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Select
            label="Link type"
            value={form.linkType}
            onChange={(event) =>
              setForm({ ...form, linkType: event.target.value as typeof form.linkType })
            }
            options={[
              { value: 'INTERNAL', label: 'Internal' },
              { value: 'EXTERNAL', label: 'External' },
              { value: 'PAGE', label: 'CMS page' },
              { value: 'COURSE', label: 'Course' },
              { value: 'CATEGORY', label: 'Category' },
            ]}
          />
          <Select
            label="Opens in"
            value={form.target}
            onChange={(event) =>
              setForm({ ...form, target: event.target.value as typeof form.target })
            }
            options={[
              { value: '_self', label: 'Same tab' },
              { value: '_blank', label: 'New tab' },
            ]}
          />
          <Input
            label="Icon"
            hint="Lucide name."
            value={form.iconName}
            onChange={(event) => setForm({ ...form, iconName: event.target.value })}
          />
        </div>

        <fieldset>
          <legend className="mb-2 text-sm font-medium text-text-primary">Role visibility</legend>
          <p className="mb-2 text-xs text-text-muted">
            Leave everything unchecked to show the item to all visitors. The API filters this
            server-side, so a restricted item is never sent to a browser that should not see it.
          </p>
          <div className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-2">
            {roles.map((role) => (
              <Checkbox
                key={role.id}
                label={role.name}
                checked={form.visibleForRoles.includes(role.slug)}
                onChange={() =>
                  setForm({
                    ...form,
                    visibleForRoles: toggleInList(form.visibleForRoles, role.slug),
                  })
                }
              />
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-sm font-medium text-text-primary">Language visibility</legend>
          <p className="mb-2 text-xs text-text-muted">Leave unchecked to show in every language.</p>
          <div className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-3">
            {LOCALES.map((locale) => (
              <Checkbox
                key={locale.code}
                label={locale.nativeName}
                checked={form.visibleForLocales.includes(locale.code)}
                onChange={() =>
                  setForm({
                    ...form,
                    visibleForLocales: toggleInList(form.visibleForLocales, locale.code),
                  })
                }
              />
            ))}
          </div>
        </fieldset>

        <Checkbox
          label="Visible"
          checked={form.isVisible}
          onChange={(event) => setForm({ ...form, isVisible: event.target.checked })}
        />
      </div>
    </Modal>
  );
}
