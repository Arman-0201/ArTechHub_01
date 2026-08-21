'use client';

import { useMemo, useState } from 'react';
import { Lock, Pencil, Plus, Trash2 } from 'lucide-react';
import type { Permission, RoleDto } from '@academy/types';
import { PERMISSIONS, PERMISSION_GROUPS, SUPER_ADMIN_ROLE } from '@academy/types';
import { api, useApiList, useApiMutation } from '@/lib/api/hooks';
import { useAuth } from '@/components/providers';
import { Alert, Badge, Button, Card, Input, Textarea } from '@/components/ui';
import { AdminPageHeader, ConfirmDialog, Modal } from './primitives';

/**
 * Role and permission management.
 *
 * Roles are user-defined; the permissions they can hold are not. The grid below
 * is generated from the code-defined catalogue, so a role can never be given a
 * permission that no middleware checks.
 */
export function RolesClient() {
  const { can } = useAuth();
  const canManage = can(PERMISSIONS.ROLES_MANAGE);

  const rolesQuery = useApiList<RoleDto>('/admin/roles');
  const roles = rolesQuery.data?.items ?? [];

  const [editing, setEditing] = useState<RoleDto | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<RoleDto | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const deleteMutation = useApiMutation(
    (role: RoleDto) => api.delete(`/admin/roles/${role.id}`),
    ['/admin/roles'],
    {
      onSuccess: () => {
        setDeleting(null);
        setDeleteError(null);
      },
      onError: (error) => setDeleteError(error.message),
    },
  );

  return (
    <>
      <AdminPageHeader
        title="Roles & permissions"
        description="What each role is allowed to do. Enforced on the server for every request."
        action={
          canManage ? (
            <Button onClick={() => setCreating(true)}>
              <Plus className="size-4" aria-hidden="true" />
              New role
            </Button>
          ) : undefined
        }
      />

      {rolesQuery.error ? (
        <Alert tone="danger" className="mb-4">
          {rolesQuery.error.message}
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {roles.map((role) => {
          const isSuperAdmin = role.slug === SUPER_ADMIN_ROLE;

          return (
            <Card key={role.id}>
              <div className="space-y-4 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold text-text-primary">{role.name}</h2>
                      {role.isSystem ? <Badge tone="neutral">System</Badge> : null}
                      {isSuperAdmin ? (
                        <Badge tone="primary">
                          <Lock className="size-3" aria-hidden="true" />
                          Full access
                        </Badge>
                      ) : null}
                    </div>
                    {role.description ? (
                      <p className="text-sm text-text-secondary">{role.description}</p>
                    ) : null}
                    <p className="text-xs text-text-muted">
                      {role.userCount ?? 0} {role.userCount === 1 ? 'user' : 'users'} ·{' '}
                      {isSuperAdmin ? 'all' : role.permissions.length} permissions
                    </p>
                  </div>

                  {canManage ? (
                    <div className="flex shrink-0 gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditing(role)}
                        aria-label={`Edit ${role.name}`}
                      >
                        <Pencil className="size-3.5" aria-hidden="true" />
                      </Button>
                      {!role.isSystem ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setDeleting(role)}
                          aria-label={`Delete ${role.name}`}
                        >
                          <Trash2 className="size-3.5 text-danger" aria-hidden="true" />
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                {!isSuperAdmin && role.permissions.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 border-t border-border pt-3">
                    {role.permissions.slice(0, 8).map((permission) => (
                      <span
                        key={permission}
                        className="rounded-md bg-surface-sunken px-2 py-0.5 font-mono text-2xs text-text-muted"
                      >
                        {permission}
                      </span>
                    ))}
                    {role.permissions.length > 8 ? (
                      <span className="px-1 text-2xs text-text-muted">
                        +{role.permissions.length - 8} more
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </Card>
          );
        })}
      </div>

      {creating ? <RoleEditor onClose={() => setCreating(false)} /> : null}
      {editing ? <RoleEditor role={editing} onClose={() => setEditing(null)} /> : null}

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => {
          setDeleting(null);
          setDeleteError(null);
        }}
        onConfirm={() => deleting && deleteMutation.mutate(deleting)}
        title={`Delete ${deleting?.name ?? 'role'}`}
        message={
          deleteError ??
          'This role will be removed. Roles still assigned to a user cannot be deleted.'
        }
        isLoading={deleteMutation.isPending}
      />
    </>
  );
}

function RoleEditor({ role, onClose }: { role?: RoleDto; onClose: () => void }) {
  const isSuperAdmin = role?.slug === SUPER_ADMIN_ROLE;

  const [name, setName] = useState(role?.name ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [permissions, setPermissions] = useState<Set<Permission>>(
    () => new Set(role?.permissions ?? []),
  );
  const [error, setError] = useState<string | null>(null);

  const mutation = useApiMutation(
    () => {
      const payload = {
        name,
        description: description || null,
        // The super-admin role always holds everything; the server rejects an
        // attempt to change its permission set, so it is not sent.
        ...(isSuperAdmin ? {} : { permissions: [...permissions] }),
      };
      return role ? api.patch(`/admin/roles/${role.id}`, payload) : api.post('/admin/roles', payload);
    },
    ['/admin/roles', '/admin/users'],
    { onSuccess: onClose, onError: (caught) => setError(caught.message) },
  );

  const groupState = useMemo(
    () =>
      PERMISSION_GROUPS.map((group) => ({
        ...group,
        selectedCount: group.permissions.filter((entry) => permissions.has(entry.key)).length,
      })),
    [permissions],
  );

  function toggleGroup(groupKey: string, enable: boolean) {
    const group = PERMISSION_GROUPS.find((entry) => entry.key === groupKey);
    if (!group) return;

    setPermissions((previous) => {
      const next = new Set(previous);
      for (const entry of group.permissions) {
        if (enable) next.add(entry.key);
        else next.delete(entry.key);
      }
      return next;
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={role ? `Edit ${role.name}` : 'Create role'}
      description={
        isSuperAdmin
          ? 'The Super Admin role always holds every permission and cannot be restricted.'
          : 'Choose exactly what this role can do.'
      }
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
            disabled={name.trim().length < 2}
          >
            {role ? 'Save role' : 'Create role'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {error ? <Alert tone="danger">{error}</Alert> : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Role name"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <Textarea
            label="Description"
            rows={2}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>

        {isSuperAdmin ? (
          <Alert tone="info">
            This role bypasses individual permission checks by design, so the platform can never be
            locked out of its own admin panel.
          </Alert>
        ) : (
          <fieldset className="space-y-4">
            <legend className="text-sm font-medium text-text-primary">Permissions</legend>

            {groupState.map((group) => {
              const allSelected = group.selectedCount === group.permissions.length;

              return (
                <div key={group.key} className="rounded-lg border border-border">
                  <div className="flex items-center justify-between border-b border-border bg-surface-sunken px-4 py-2.5">
                    <span className="text-sm font-medium text-text-primary">{group.label}</span>
                    <button
                      type="button"
                      onClick={() => toggleGroup(group.key, !allSelected)}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      {allSelected ? 'Clear all' : 'Select all'}
                    </button>
                  </div>

                  <div className="grid gap-x-6 gap-y-2 p-4 sm:grid-cols-2">
                    {group.permissions.map((entry) => (
                      <label
                        key={entry.key}
                        className="flex cursor-pointer items-start gap-2.5 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={permissions.has(entry.key)}
                          onChange={(event) =>
                            setPermissions((previous) => {
                              const next = new Set(previous);
                              if (event.target.checked) next.add(entry.key);
                              else next.delete(entry.key);
                              return next;
                            })
                          }
                          className="mt-0.5 size-4 shrink-0 rounded border-border-strong text-primary"
                        />
                        <span className="min-w-0">
                          <span className="block text-text-secondary">{entry.label}</span>
                          <span className="block font-mono text-2xs text-text-muted">
                            {entry.key}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </fieldset>
        )}
      </div>
    </Modal>
  );
}
