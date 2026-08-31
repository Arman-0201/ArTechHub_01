import {
  ALL_PERMISSIONS,
  PERMISSION_GROUPS,
  SUPER_ADMIN_ROLE,
  SYSTEM_ROLES,
  type Permission,
  type RoleDto,
} from '@academy/types';
import { prisma } from '../../lib/prisma.js';
import { BadRequestError, ConflictError, NotFoundError } from '../../lib/errors.js';
import { slugify, uniqueSlug } from '../../lib/slug.js';
import { disconnectUsers } from '../../realtime/hub.js';

/**
 * Roles are user-defined; permissions are not. Every permission assigned to a
 * role must exist in the code-defined catalogue, so a role can never grant
 * something no middleware checks.
 */

const roleInclude = {
  permissions: { select: { permission: { select: { key: true } } } },
  _count: { select: { users: true } },
} as const;

type RoleRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
  permissions: { permission: { key: string } }[];
  _count: { users: number };
};

function toDto(role: RoleRow): RoleDto {
  return {
    id: role.id,
    slug: role.slug,
    name: role.name,
    description: role.description,
    isSystem: role.isSystem,
    permissions: role.permissions.map((entry) => entry.permission.key as Permission),
    userCount: role._count.users,
    createdAt: role.createdAt.toISOString(),
    updatedAt: role.updatedAt.toISOString(),
  };
}

export async function listRoles(): Promise<RoleDto[]> {
  const roles = await prisma.role.findMany({
    orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    include: roleInclude,
  });
  return roles.map(toDto);
}

export async function getRole(id: string): Promise<RoleDto> {
  const role = await prisma.role.findUnique({ where: { id }, include: roleInclude });
  if (!role) throw new NotFoundError('Role');
  return toDto(role);
}

export function listPermissionCatalogue() {
  return { permissions: ALL_PERMISSIONS, groups: PERMISSION_GROUPS };
}

async function resolvePermissionIds(keys: Permission[]): Promise<string[]> {
  const unknown = keys.filter((key) => !ALL_PERMISSIONS.includes(key));
  if (unknown.length > 0) {
    throw new BadRequestError(`Unknown permissions: ${unknown.join(', ')}`);
  }

  const rows = await prisma.permission.findMany({
    where: { key: { in: keys } },
    select: { id: true },
  });

  if (rows.length !== keys.length) {
    // The catalogue is seeded from code; a mismatch means the seed is stale.
    throw new BadRequestError('Permission catalogue is out of date — run the database seed');
  }

  return rows.map((row) => row.id);
}

export async function createRole(input: {
  name: string;
  slug?: string;
  description?: string | null;
  permissions?: Permission[];
}): Promise<RoleDto> {
  const slug = await uniqueSlug(
    input.slug ?? input.name,
    async (candidate) =>
      (await prisma.role.count({ where: { slug: candidate } })) > 0,
    { fallbackPrefix: 'role' },
  );

  const permissionIds = await resolvePermissionIds(input.permissions ?? []);

  const role = await prisma.role.create({
    data: {
      slug,
      name: input.name,
      description: input.description ?? null,
      permissions: { create: permissionIds.map((permissionId) => ({ permissionId })) },
    },
    include: roleInclude,
  });

  return toDto(role);
}

export async function updateRole(
  id: string,
  input: { name?: string; description?: string | null; permissions?: Permission[] },
): Promise<RoleDto> {
  const existing = await prisma.role.findUnique({
    where: { id },
    select: { id: true, slug: true, isSystem: true },
  });
  if (!existing) throw new NotFoundError('Role');

  // The super-admin role is the platform's escape hatch: if its permission set
  // could be edited, an operator could lock everyone out of the admin panel.
  if (existing.slug === SUPER_ADMIN_ROLE && input.permissions) {
    throw new BadRequestError('The Super Admin role always holds every permission');
  }

  const permissionIds =
    input.permissions !== undefined ? await resolvePermissionIds(input.permissions) : null;

  const role = await prisma.$transaction(async (tx) => {
    if (permissionIds) {
      await tx.rolePermission.deleteMany({ where: { roleId: id } });
      if (permissionIds.length > 0) {
        await tx.rolePermission.createMany({
          data: permissionIds.map((permissionId) => ({ roleId: id, permissionId })),
        });
      }
    }

    return tx.role.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
      },
      include: roleInclude,
    });
  });

  // Users holding this role must pick up the new permission set immediately.
  await invalidateSessionsForRole(id);

  return toDto(role);
}

export async function deleteRole(id: string): Promise<void> {
  const role = await prisma.role.findUnique({
    where: { id },
    select: { id: true, slug: true, isSystem: true, _count: { select: { users: true } } },
  });
  if (!role) throw new NotFoundError('Role');

  if (role.isSystem) {
    throw new BadRequestError('System roles cannot be deleted');
  }
  if (role._count.users > 0) {
    throw new ConflictError(
      `This role is still assigned to ${role._count.users} user(s). Reassign them first.`,
    );
  }

  await prisma.role.delete({ where: { id } });
}

/**
 * Bumps `tokenVersion` for every holder of a role, invalidating their access
 * tokens so a permission change takes effect on the next request rather than
 * at the next token expiry.
 */
export async function invalidateSessionsForRole(roleId: string): Promise<void> {
  const holders = await prisma.userRole.findMany({
    where: { roleId },
    select: { userId: true },
  });
  if (holders.length === 0) return;

  const userIds = holders.map((holder) => holder.userId);

  await prisma.user.updateMany({
    where: { id: { in: userIds } },
    data: { tokenVersion: { increment: 1 } },
  });

  // And their live feeds, which `tokenVersion` does not reach: a socket is
  // checked once at the handshake. Each reconnects and is re-admitted with the
  // permissions the role now carries.
  disconnectUsers(userIds, 'Permissions changed');
}

/** Ensures the permission catalogue rows match the code definitions. */
export async function syncPermissionCatalogue(): Promise<void> {
  for (const group of PERMISSION_GROUPS) {
    for (const permission of group.permissions) {
      await prisma.permission.upsert({
        where: { key: permission.key },
        create: { key: permission.key, label: permission.label, groupKey: group.key },
        update: { label: permission.label, groupKey: group.key },
      });
    }
  }

  // Super Admin holds everything by definition, including permissions added in
  // a later release.
  const superAdmin = await prisma.role.findUnique({
    where: { slug: SUPER_ADMIN_ROLE },
    select: { id: true },
  });
  if (superAdmin) {
    const permissions = await prisma.permission.findMany({ select: { id: true } });
    await prisma.rolePermission.createMany({
      data: permissions.map((permission) => ({
        roleId: superAdmin.id,
        permissionId: permission.id,
      })),
      skipDuplicates: true,
    });
  }
}

export function isSystemRoleSlug(slug: string): boolean {
  return Object.values(SYSTEM_ROLES).includes(slug as never);
}

export { slugify };
