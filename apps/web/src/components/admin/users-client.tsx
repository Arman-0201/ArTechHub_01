'use client';

import { useState } from 'react';
import { Plus, Search, ShieldCheck, Trash2, UserPen } from 'lucide-react';
import type { RoleDto, UserSummaryDto } from '@academy/types';
import { PERMISSIONS } from '@academy/types';
import { api, useApiList, useApiMutation } from '@/lib/api/hooks';
import { colorFromString, formatDate, initialsOf } from '@/lib/utils';
import { useAuth } from '@/components/providers';
import { Alert, Badge, Button, Checkbox, Input, Select } from '@/components/ui';
import { Pagination } from '@/components/ui/pagination';
import {
  AdminPageHeader,
  ConfirmDialog,
  DataTable,
  Modal,
  TableCell,
  TableRow,
} from './primitives';

const STATUS_TONES = {
  ACTIVE: 'success',
  PENDING: 'warning',
  INACTIVE: 'neutral',
  SUSPENDED: 'danger',
} as const;

/**
 * User management.
 *
 * Paginated and filtered server-side — the browser never holds more than one
 * page of users, which is what keeps the screen usable at any scale.
 */
export function UsersClient({ locale }: { locale: string }) {
  const { can } = useAuth();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [roleFilter, setRoleFilter] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<UserSummaryDto | null>(null);
  const [rolesFor, setRolesFor] = useState<UserSummaryDto | null>(null);
  const [deleting, setDeleting] = useState<UserSummaryDto | null>(null);

  const usersQuery = useApiList<UserSummaryDto>('/admin/users', {
    page,
    pageSize: 20,
    search: search || undefined,
    status: status || undefined,
    role: roleFilter || undefined,
  });

  const rolesQuery = useApiList<RoleDto>('/admin/roles');
  const roles = rolesQuery.data?.items ?? [];

  const canCreate = can(PERMISSIONS.USERS_CREATE);
  const canUpdate = can(PERMISSIONS.USERS_UPDATE);
  const canDelete = can(PERMISSIONS.USERS_DELETE);
  const canManageRoles = can(PERMISSIONS.ROLES_MANAGE);

  return (
    <>
      <AdminPageHeader
        title="Users"
        description="Accounts, roles and access."
        action={
          canCreate ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" aria-hidden="true" />
              New user
            </Button>
          ) : undefined
        }
      />

      <div className="mb-5 flex flex-col gap-3 sm:flex-row">
        <Input
          type="search"
          placeholder="Search by name or email…"
          aria-label="Search users"
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
            { value: 'ACTIVE', label: 'Active' },
            { value: 'PENDING', label: 'Pending' },
            { value: 'INACTIVE', label: 'Inactive' },
            { value: 'SUSPENDED', label: 'Suspended' },
          ]}
          containerClassName="sm:w-44"
        />
        <Select
          aria-label="Filter by role"
          value={roleFilter}
          onChange={(event) => {
            setRoleFilter(event.target.value);
            setPage(1);
          }}
          placeholder="All roles"
          options={roles.map((role) => ({ value: role.slug, label: role.name }))}
          containerClassName="sm:w-44"
        />
      </div>

      {usersQuery.error ? (
        <Alert tone="danger" className="mb-4">
          {usersQuery.error.message}
        </Alert>
      ) : null}

      <DataTable
        headers={['User', 'Roles', 'Status', 'Joined', 'Last seen', '']}
        isLoading={usersQuery.isLoading}
        isEmpty={(usersQuery.data?.items.length ?? 0) === 0}
        emptyMessage="No users match these filters."
      >
        {usersQuery.data?.items.map((user) => (
          <TableRow key={user.id}>
            <TableCell>
              <div className="flex items-center gap-3">
                {user.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.avatarUrl} alt="" className="size-8 rounded-full object-cover" />
                ) : (
                  <span
                    className="grid size-8 shrink-0 place-items-center rounded-full text-2xs font-semibold text-white"
                    style={{ backgroundColor: colorFromString(user.id) }}
                    aria-hidden="true"
                  >
                    {initialsOf(user.name)}
                  </span>
                )}
                <div className="min-w-0">
                  <p className="truncate font-medium text-text-primary">{user.name}</p>
                  <p className="truncate text-xs text-text-muted">{user.email}</p>
                </div>
              </div>
            </TableCell>

            <TableCell>
              <div className="flex flex-wrap gap-1">
                {user.roles.length > 0 ? (
                  user.roles.map((role) => (
                    <Badge key={role.id} tone="primary">
                      {role.name}
                    </Badge>
                  ))
                ) : (
                  <span className="text-xs text-text-muted">None</span>
                )}
              </div>
            </TableCell>

            <TableCell>
              <div className="flex flex-col gap-1">
                <Badge tone={STATUS_TONES[user.status as keyof typeof STATUS_TONES] ?? 'neutral'}>
                  {user.status.toLowerCase()}
                </Badge>
                {!user.emailVerified ? (
                  <span className="text-2xs text-text-muted">Unverified</span>
                ) : null}
              </div>
            </TableCell>

            <TableCell className="whitespace-nowrap text-xs">
              {formatDate(user.createdAt, locale)}
            </TableCell>

            <TableCell className="whitespace-nowrap text-xs">
              {user.lastLoginAt ? formatDate(user.lastLoginAt, locale) : '—'}
            </TableCell>

            <TableCell align="right">
              <div className="flex justify-end gap-1">
                {canManageRoles ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setRolesFor(user)}
                    aria-label={`Manage roles for ${user.name}`}
                  >
                    <ShieldCheck className="size-3.5" aria-hidden="true" />
                  </Button>
                ) : null}
                {canUpdate ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditing(user)}
                    aria-label={`Edit ${user.name}`}
                  >
                    <UserPen className="size-3.5" aria-hidden="true" />
                  </Button>
                ) : null}
                {canDelete ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setDeleting(user)}
                    aria-label={`Remove ${user.name}`}
                  >
                    <Trash2 className="size-3.5 text-danger" aria-hidden="true" />
                  </Button>
                ) : null}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </DataTable>

      {usersQuery.data?.meta && usersQuery.data.meta.totalPages > 1 ? (
        <ClientPagination
          meta={usersQuery.data.meta}
          onPageChange={setPage}
          className="mt-5"
        />
      ) : null}

      {createOpen ? (
        <CreateUserModal roles={roles} onClose={() => setCreateOpen(false)} />
      ) : null}

      {editing ? <EditUserModal user={editing} onClose={() => setEditing(null)} /> : null}

      {rolesFor ? (
        <ManageRolesModal user={rolesFor} roles={roles} onClose={() => setRolesFor(null)} />
      ) : null}

      {deleting ? <DeleteUserModal user={deleting} onClose={() => setDeleting(null)} /> : null}
    </>
  );
}

/** Pagination driven by component state rather than the URL. */
function ClientPagination({
  meta,
  onPageChange,
  className,
}: {
  meta: import('@academy/types').PaginationMeta;
  onPageChange: (page: number) => void;
  className?: string;
}) {
  return (
    <nav aria-label="Pagination" className={`flex items-center justify-between gap-3 ${className ?? ''}`}>
      <p className="text-sm text-text-muted">
        Page {meta.page} of {meta.totalPages} · {meta.total} total
      </p>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={!meta.hasPreviousPage}
          onClick={() => onPageChange(meta.page - 1)}
        >
          Previous
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!meta.hasNextPage}
          onClick={() => onPageChange(meta.page + 1)}
        >
          Next
        </Button>
      </div>
    </nav>
  );
}

/* ---------------------------------------------------------------- modals */

function CreateUserModal({ roles, onClose }: { roles: RoleDto[]; onClose: () => void }) {
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    roleIds: [] as string[],
    markEmailVerified: true,
  });
  const [error, setError] = useState<string | null>(null);

  const mutation = useApiMutation(
    (values: typeof form) => api.post('/admin/users', values),
    ['/admin/users'],
    { onSuccess: onClose, onError: (caught) => setError(caught.message) },
  );

  return (
    <Modal
      open
      onClose={onClose}
      title="Create user"
      description="The account is usable immediately; share the password securely."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              setError(null);
              mutation.mutate(form);
            }}
            isLoading={mutation.isPending}
            disabled={form.roleIds.length === 0}
          >
            Create user
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error ? <Alert tone="danger">{error}</Alert> : null}

        <Input
          label="Full name"
          required
          value={form.name}
          onChange={(event) => setForm({ ...form, name: event.target.value })}
        />
        <Input
          label="Email address"
          type="email"
          required
          value={form.email}
          onChange={(event) => setForm({ ...form, email: event.target.value })}
        />
        <Input
          label="Temporary password"
          type="text"
          required
          hint="At least 10 characters, with upper and lower case letters and a number."
          value={form.password}
          onChange={(event) => setForm({ ...form, password: event.target.value })}
        />

        <fieldset>
          <legend className="mb-2 text-sm font-medium text-text-primary">Roles</legend>
          <div className="space-y-2 rounded-lg border border-border p-3">
            {roles.map((role) => (
              <Checkbox
                key={role.id}
                label={role.name}
                checked={form.roleIds.includes(role.id)}
                onChange={(event) =>
                  setForm({
                    ...form,
                    roleIds: event.target.checked
                      ? [...form.roleIds, role.id]
                      : form.roleIds.filter((id) => id !== role.id),
                  })
                }
              />
            ))}
          </div>
        </fieldset>

        <Checkbox
          label="Mark the email address as already verified"
          checked={form.markEmailVerified}
          onChange={(event) => setForm({ ...form, markEmailVerified: event.target.checked })}
        />
      </div>
    </Modal>
  );
}

function EditUserModal({ user, onClose }: { user: UserSummaryDto; onClose: () => void }) {
  const [form, setForm] = useState({
    name: user.name,
    email: user.email,
    status: user.status,
    emailVerified: user.emailVerified,
  });
  const [error, setError] = useState<string | null>(null);

  const mutation = useApiMutation(
    (values: typeof form) => api.patch(`/admin/users/${user.id}`, values),
    ['/admin/users'],
    { onSuccess: onClose, onError: (caught) => setError(caught.message) },
  );

  return (
    <Modal
      open
      onClose={onClose}
      title={`Edit ${user.name}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              setError(null);
              mutation.mutate(form);
            }}
            isLoading={mutation.isPending}
          >
            Save changes
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error ? <Alert tone="danger">{error}</Alert> : null}

        <Input
          label="Full name"
          value={form.name}
          onChange={(event) => setForm({ ...form, name: event.target.value })}
        />
        <Input
          label="Email address"
          type="email"
          hint="Changing the address signs the user out of every device."
          value={form.email}
          onChange={(event) => setForm({ ...form, email: event.target.value })}
        />
        <Select
          label="Status"
          value={form.status}
          onChange={(event) => setForm({ ...form, status: event.target.value as typeof form.status })}
          options={[
            { value: 'ACTIVE', label: 'Active' },
            { value: 'PENDING', label: 'Pending verification' },
            { value: 'INACTIVE', label: 'Inactive — cannot sign in' },
            { value: 'SUSPENDED', label: 'Suspended — blocked' },
          ]}
        />
        <Checkbox
          label="Email address is verified"
          checked={form.emailVerified}
          onChange={(event) => setForm({ ...form, emailVerified: event.target.checked })}
        />
      </div>
    </Modal>
  );
}

function ManageRolesModal({
  user,
  roles,
  onClose,
}: {
  user: UserSummaryDto;
  roles: RoleDto[];
  onClose: () => void;
}) {
  const [roleIds, setRoleIds] = useState(user.roles.map((role) => role.id));
  const [error, setError] = useState<string | null>(null);

  const mutation = useApiMutation(
    (ids: string[]) => api.put(`/admin/users/${user.id}/roles`, { roleIds: ids }),
    ['/admin/users'],
    { onSuccess: onClose, onError: (caught) => setError(caught.message) },
  );

  return (
    <Modal
      open
      onClose={onClose}
      title={`Roles for ${user.name}`}
      description="Permission changes take effect on the user's next request."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              setError(null);
              mutation.mutate(roleIds);
            }}
            isLoading={mutation.isPending}
          >
            Save roles
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error ? <Alert tone="danger">{error}</Alert> : null}

        <div className="space-y-3">
          {roles.map((role) => (
            <label
              key={role.id}
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 transition-colors hover:border-border-strong"
            >
              <input
                type="checkbox"
                checked={roleIds.includes(role.id)}
                onChange={(event) =>
                  setRoleIds(
                    event.target.checked
                      ? [...roleIds, role.id]
                      : roleIds.filter((id) => id !== role.id),
                  )
                }
                className="mt-0.5 size-4 rounded border-border-strong text-primary"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-text-primary">{role.name}</span>
                {role.description ? (
                  <span className="block text-xs text-text-muted">{role.description}</span>
                ) : null}
                <span className="mt-1 block text-2xs text-text-muted">
                  {role.permissions.length} permissions
                </span>
              </span>
            </label>
          ))}
        </div>
      </div>
    </Modal>
  );
}

/**
 * Deletion.
 *
 * Three explicit strategies rather than one destructive default: deactivating
 * is reversible, anonymising satisfies an erasure request while keeping
 * aggregate learning data, and purging is a true hard delete.
 */
function DeleteUserModal({ user, onClose }: { user: UserSummaryDto; onClose: () => void }) {
  const [strategy, setStrategy] = useState<'deactivate' | 'anonymize' | 'purge'>('deactivate');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useApiMutation(
    () => api.post(`/admin/users/${user.id}/delete`, { strategy, reason: reason || undefined }),
    ['/admin/users'],
    { onSuccess: onClose, onError: (caught) => setError(caught.message) },
  );

  const options = [
    {
      value: 'deactivate' as const,
      title: 'Deactivate',
      description: 'The account cannot sign in. Everything is kept and can be restored.',
    },
    {
      value: 'anonymize' as const,
      title: 'Anonymise',
      description:
        'Identifying details are scrubbed permanently; learning statistics survive in aggregate. Use this for erasure requests.',
    },
    {
      value: 'purge' as const,
      title: 'Delete permanently',
      description:
        'Removes the account and all its data. Cannot be undone. Super Admin only.',
    },
  ];

  return (
    <Modal
      open
      onClose={onClose}
      title={`Remove ${user.name}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              setError(null);
              mutation.mutate(undefined as never);
            }}
            isLoading={mutation.isPending}
          >
            Confirm
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error ? <Alert tone="danger">{error}</Alert> : null}

        <div className="space-y-2" role="radiogroup" aria-label="Removal strategy">
          {options.map((option) => (
            <label
              key={option.value}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                strategy === option.value ? 'border-primary bg-primary-soft' : 'border-border'
              }`}
            >
              <input
                type="radio"
                name="delete-strategy"
                value={option.value}
                checked={strategy === option.value}
                onChange={() => setStrategy(option.value)}
                className="mt-0.5 size-4 text-primary"
              />
              <span>
                <span className="block text-sm font-medium text-text-primary">{option.title}</span>
                <span className="block text-xs text-text-secondary">{option.description}</span>
              </span>
            </label>
          ))}
        </div>

        <Input
          label="Reason (recorded in the audit log)"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </div>
    </Modal>
  );
}

export { ClientPagination };
