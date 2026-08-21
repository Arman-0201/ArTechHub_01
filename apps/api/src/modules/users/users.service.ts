import crypto from 'node:crypto';
import type { Prisma } from '@prisma/client';
import {
  SUPER_ADMIN_ROLE,
  type LearningStatsDto,
  type PaginatedResult,
  type UserDetailDto,
  type UserSummaryDto,
} from '@academy/types';
import { prisma } from '../../lib/prisma.js';
import { BadRequestError, ConflictError, NotFoundError } from '../../lib/errors.js';
import { buildPaginationMeta, toSkipTake } from '../../lib/http.js';
import { hashPassword } from '../../lib/crypto.js';
import { resolveMediaUrl } from '../media/media.helpers.js';
import { computeLearningStats } from '../progress/progress.service.js';

const userSummarySelect = {
  id: true,
  email: true,
  name: true,
  status: true,
  emailVerified: true,
  locale: true,
  createdAt: true,
  lastLoginAt: true,
  avatar: { select: { url: true, storageKey: true, storageDriver: true } },
  roles: { select: { role: { select: { id: true, slug: true, name: true } } } },
  _count: { select: { enrollments: true } },
} satisfies Prisma.UserSelect;

type UserSummaryRow = Prisma.UserGetPayload<{ select: typeof userSummarySelect }>;

function toSummary(user: UserSummaryRow): UserSummaryDto {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatar ? resolveMediaUrl(user.avatar) : null,
    status: user.status,
    emailVerified: user.emailVerified,
    locale: user.locale,
    roles: user.roles.map((entry) => entry.role),
    createdAt: user.createdAt.toISOString(),
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    enrollmentCount: user._count.enrollments,
  };
}

export interface ListUsersInput {
  page: number;
  pageSize: number;
  search?: string;
  status?: string;
  role?: string;
  verified?: boolean;
  sort?: string;
  order: 'asc' | 'desc';
}

/** Columns a client is allowed to sort by — an allowlist, not free text. */
const SORTABLE_USER_FIELDS = new Set(['createdAt', 'name', 'email', 'lastLoginAt', 'status']);

export async function listUsers(input: ListUsersInput): Promise<PaginatedResult<UserSummaryDto>> {
  const where: Prisma.UserWhereInput = {
    deletedAt: null,
    ...(input.status ? { status: input.status as never } : {}),
    ...(input.verified !== undefined ? { emailVerified: input.verified } : {}),
    ...(input.role ? { roles: { some: { role: { slug: input.role } } } } : {}),
    ...(input.search
      ? {
          OR: [
            { name: { contains: input.search, mode: 'insensitive' } },
            { email: { contains: input.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const sortField = input.sort && SORTABLE_USER_FIELDS.has(input.sort) ? input.sort : 'createdAt';
  const { skip, take } = toSkipTake(input.page, input.pageSize);

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { [sortField]: input.order },
      skip,
      take,
      select: userSummarySelect,
    }),
    prisma.user.count({ where }),
  ]);

  return {
    items: users.map(toSummary),
    meta: buildPaginationMeta(total, input.page, input.pageSize),
  };
}

export async function getUserDetail(id: string): Promise<UserDetailDto> {
  const user = await prisma.user.findFirst({
    where: { id, deletedAt: null },
    select: {
      ...userSummarySelect,
      headline: true,
      bio: true,
      updatedAt: true,
      deletedAt: true,
      authProviders: { select: { provider: true, createdAt: true } },
    },
  });
  if (!user) throw new NotFoundError('User');

  const stats = await computeLearningStats(id);

  return {
    ...toSummary(user),
    headline: user.headline,
    bio: user.bio,
    updatedAt: user.updatedAt.toISOString(),
    deletedAt: user.deletedAt?.toISOString() ?? null,
    authProviders: user.authProviders.map((provider) => ({
      provider: provider.provider,
      connectedAt: provider.createdAt.toISOString(),
    })),
    stats,
  };
}

export async function createUser(input: {
  name: string;
  email: string;
  password: string;
  roleIds: string[];
  status?: string;
  locale?: string;
  markEmailVerified: boolean;
}): Promise<UserSummaryDto> {
  const existing = await prisma.user.findUnique({
    where: { email: input.email.toLowerCase() },
    select: { id: true },
  });
  if (existing) {
    throw new ConflictError('An account with this email already exists', {
      email: ['Already in use'],
    });
  }

  await assertRolesExist(input.roleIds);

  const user = await prisma.user.create({
    data: {
      email: input.email.toLowerCase(),
      name: input.name,
      passwordHash: await hashPassword(input.password),
      status: (input.status as never) ?? (input.markEmailVerified ? 'ACTIVE' : 'PENDING'),
      emailVerified: input.markEmailVerified,
      locale: input.locale ?? 'en',
      roles: { create: input.roleIds.map((roleId) => ({ roleId })) },
    },
    select: userSummarySelect,
  });

  return toSummary(user);
}

export async function updateUser(
  id: string,
  input: {
    name?: string;
    email?: string;
    status?: string;
    locale?: string;
    headline?: string | null;
    bio?: string | null;
    emailVerified?: boolean;
  },
  actor: { id: string; isSuperAdmin: boolean },
): Promise<UserSummaryDto> {
  const target = await prisma.user.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, email: true, roles: { select: { role: { select: { slug: true } } } } },
  });
  if (!target) throw new NotFoundError('User');

  await assertActorMayModify(target, actor);

  if (input.email && input.email.toLowerCase() !== target.email) {
    const clash = await prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
      select: { id: true },
    });
    if (clash) throw new ConflictError('That email is already in use', { email: ['Already in use'] });
  }

  // A status change to SUSPENDED/INACTIVE must terminate live sessions, not
  // wait for the current access token to expire.
  const revokesSessions =
    input.status === 'SUSPENDED' || input.status === 'INACTIVE' || input.email !== undefined;

  const user = await prisma.user.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.email !== undefined ? { email: input.email.toLowerCase() } : {}),
      ...(input.status !== undefined ? { status: input.status as never } : {}),
      ...(input.locale !== undefined ? { locale: input.locale } : {}),
      ...(input.headline !== undefined ? { headline: input.headline } : {}),
      ...(input.bio !== undefined ? { bio: input.bio } : {}),
      ...(input.emailVerified !== undefined ? { emailVerified: input.emailVerified } : {}),
      ...(revokesSessions ? { tokenVersion: { increment: 1 } } : {}),
    },
    select: userSummarySelect,
  });

  if (revokesSessions) {
    await prisma.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  return toSummary(user);
}

export async function assignRoles(
  id: string,
  roleIds: string[],
  actor: { id: string; isSuperAdmin: boolean },
): Promise<UserSummaryDto> {
  const target = await prisma.user.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, roles: { select: { role: { select: { slug: true } } } } },
  });
  if (!target) throw new NotFoundError('User');

  await assertActorMayModify(target, actor);
  await assertRolesExist(roleIds);

  // Only a super admin may hand out super admin.
  const roles = await prisma.role.findMany({
    where: { id: { in: roleIds } },
    select: { slug: true },
  });
  if (roles.some((role) => role.slug === SUPER_ADMIN_ROLE) && !actor.isSuperAdmin) {
    throw new BadRequestError('Only a Super Admin can grant the Super Admin role');
  }

  // Refuse to remove the last super admin — that would leave the platform with
  // nobody able to restore access.
  const wasSuperAdmin = target.roles.some((entry) => entry.role.slug === SUPER_ADMIN_ROLE);
  const willBeSuperAdmin = roles.some((role) => role.slug === SUPER_ADMIN_ROLE);
  if (wasSuperAdmin && !willBeSuperAdmin) {
    await assertNotLastSuperAdmin(id);
  }

  const user = await prisma.$transaction(async (tx) => {
    await tx.userRole.deleteMany({ where: { userId: id } });
    if (roleIds.length > 0) {
      await tx.userRole.createMany({ data: roleIds.map((roleId) => ({ userId: id, roleId })) });
    }
    return tx.user.update({
      where: { id },
      // New permissions must apply immediately.
      data: { tokenVersion: { increment: 1 } },
      select: userSummarySelect,
    });
  });

  return toSummary(user);
}

/**
 * User deletion.
 *
 * Destroying a learner row would cascade away enrollments, progress and legal
 * acceptances — records that may be needed for support or compliance. Three
 * explicit strategies instead of one destructive default:
 *
 *   deactivate — reversible; the account simply cannot sign in.
 *   anonymize  — irreversible; identifiers are scrubbed while learning and
 *                consent history survive in aggregate. This is the GDPR
 *                erasure path.
 *   purge      — full hard delete, super admin only, for genuine mistakes
 *                (spam signups) where no history is worth keeping.
 */
export async function deleteUser(
  id: string,
  strategy: 'deactivate' | 'anonymize' | 'purge',
  actor: { id: string; isSuperAdmin: boolean },
): Promise<{ strategy: string }> {
  if (id === actor.id) throw new BadRequestError('You cannot delete your own account here');

  const target = await prisma.user.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, roles: { select: { role: { select: { slug: true } } } } },
  });
  if (!target) throw new NotFoundError('User');

  await assertActorMayModify(target, actor);
  if (target.roles.some((entry) => entry.role.slug === SUPER_ADMIN_ROLE)) {
    await assertNotLastSuperAdmin(id);
  }

  if (strategy === 'purge') {
    if (!actor.isSuperAdmin) {
      throw new BadRequestError('Only a Super Admin can permanently delete an account');
    }
    await prisma.user.delete({ where: { id } });
    return { strategy };
  }

  if (strategy === 'anonymize') {
    const anonymousSuffix = crypto.randomBytes(6).toString('hex');
    await prisma.$transaction([
      prisma.user.update({
        where: { id },
        data: {
          email: `deleted-${anonymousSuffix}@anonymized.local`,
          name: 'Deleted user',
          headline: null,
          bio: null,
          avatarMediaId: null,
          passwordHash: null,
          emailVerified: false,
          status: 'INACTIVE',
          marketingOptIn: false,
          deletedAt: new Date(),
          tokenVersion: { increment: 1 },
        },
      }),
      prisma.authProvider.deleteMany({ where: { userId: id } }),
      prisma.refreshToken.deleteMany({ where: { userId: id } }),
      prisma.verificationToken.deleteMany({ where: { userId: id } }),
    ]);
    return { strategy };
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id },
      data: { status: 'INACTIVE', tokenVersion: { increment: 1 } },
    }),
    prisma.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
  return { strategy };
}

/* ------------------------------------------------------------------ guards */

async function assertRolesExist(roleIds: string[]): Promise<void> {
  if (roleIds.length === 0) return;
  const count = await prisma.role.count({ where: { id: { in: roleIds } } });
  if (count !== roleIds.length) throw new BadRequestError('One or more roles do not exist');
}

/**
 * A non-super-admin must not be able to edit, demote or delete a super admin —
 * otherwise "manage users" would be a privilege-escalation path.
 */
async function assertActorMayModify(
  target: { roles: { role: { slug: string } }[] },
  actor: { isSuperAdmin: boolean },
): Promise<void> {
  const targetIsSuperAdmin = target.roles.some((entry) => entry.role.slug === SUPER_ADMIN_ROLE);
  if (targetIsSuperAdmin && !actor.isSuperAdmin) {
    throw new BadRequestError('Only a Super Admin can modify another Super Admin');
  }
}

async function assertNotLastSuperAdmin(userId: string): Promise<void> {
  const remaining = await prisma.user.count({
    where: {
      deletedAt: null,
      status: 'ACTIVE',
      id: { not: userId },
      roles: { some: { role: { slug: SUPER_ADMIN_ROLE } } },
    },
  });
  if (remaining === 0) {
    throw new BadRequestError('The last Super Admin cannot be removed');
  }
}

/* ------------------------------------------------------------- self-service */

export async function updateOwnProfile(
  userId: string,
  input: {
    name?: string;
    headline?: string | null;
    bio?: string | null;
    avatarMediaId?: string | null;
    locale?: string;
  },
): Promise<UserSummaryDto> {
  if (input.avatarMediaId) {
    const media = await prisma.media.findUnique({
      where: { id: input.avatarMediaId },
      select: { id: true, kind: true },
    });
    if (!media || media.kind !== 'IMAGE') {
      throw new BadRequestError('Choose an image for your avatar');
    }
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.headline !== undefined ? { headline: input.headline } : {}),
      ...(input.bio !== undefined ? { bio: input.bio } : {}),
      ...(input.avatarMediaId !== undefined ? { avatarMediaId: input.avatarMediaId } : {}),
      ...(input.locale !== undefined ? { locale: input.locale } : {}),
    },
    select: userSummarySelect,
  });

  return toSummary(user);
}

export async function updatePreferences(
  userId: string,
  input: {
    locale?: string;
    theme?: string;
    emailNotifications?: boolean;
    marketingOptIn?: boolean;
  },
): Promise<{ locale: string; theme: string; emailNotifications: boolean; marketingOptIn: boolean }> {
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(input.locale !== undefined ? { locale: input.locale } : {}),
      ...(input.theme !== undefined ? { theme: input.theme } : {}),
      ...(input.emailNotifications !== undefined
        ? { emailNotifications: input.emailNotifications }
        : {}),
      ...(input.marketingOptIn !== undefined ? { marketingOptIn: input.marketingOptIn } : {}),
    },
    select: { locale: true, theme: true, emailNotifications: true, marketingOptIn: true },
  });
  return user;
}

export type { LearningStatsDto };
