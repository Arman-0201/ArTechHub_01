import type { Prisma, VerificationPurpose } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';

/**
 * Data access for the auth module. Keeping the queries here means the service
 * reads as a sequence of security decisions rather than a wall of Prisma
 * selects, and the exact column set returned for a login is defined in one
 * place.
 */

export const sessionUserSelect = {
  id: true,
  email: true,
  name: true,
  avatarMediaId: true,
  status: true,
  emailVerified: true,
  locale: true,
  tokenVersion: true,
  roles: {
    select: {
      role: {
        select: {
          id: true,
          slug: true,
          name: true,
          permissions: { select: { permission: { select: { key: true } } } },
        },
      },
    },
  },
  avatar: { select: { url: true, storageKey: true, storageDriver: true } },
} satisfies Prisma.UserSelect;

export type SessionUserRow = Prisma.UserGetPayload<{ select: typeof sessionUserSelect }>;

export function findUserByEmail(email: string) {
  return prisma.user.findFirst({
    where: { email: email.toLowerCase(), deletedAt: null },
    select: {
      ...sessionUserSelect,
      passwordHash: true,
      failedLoginCount: true,
      lockedUntil: true,
    },
  });
}

export function findSessionUserById(id: string): Promise<SessionUserRow | null> {
  return prisma.user.findFirst({
    where: { id, deletedAt: null },
    select: sessionUserSelect,
  });
}

export function createVerificationToken(data: {
  userId: string;
  purpose: VerificationPurpose;
  tokenHash: string;
  expiresAt: Date;
  metadata?: Prisma.InputJsonValue;
}) {
  return prisma.verificationToken.create({ data });
}

/**
 * Invalidates outstanding tokens of a purpose before issuing a new one, so a
 * user who requests three password resets cannot end up with three live links.
 */
export function consumeOutstandingTokens(userId: string, purpose: VerificationPurpose) {
  return prisma.verificationToken.updateMany({
    where: { userId, purpose, usedAt: null },
    data: { usedAt: new Date() },
  });
}

export function findLiveVerificationToken(tokenHash: string, purpose: VerificationPurpose) {
  return prisma.verificationToken.findFirst({
    where: { tokenHash, purpose, usedAt: null, expiresAt: { gt: new Date() } },
    include: { user: { select: { id: true, email: true, name: true, emailVerified: true } } },
  });
}

export function markTokenUsed(id: string) {
  return prisma.verificationToken.update({ where: { id }, data: { usedAt: new Date() } });
}

export function createRefreshToken(data: {
  userId: string;
  tokenHash: string;
  familyId: string;
  expiresAt: Date;
  userAgent?: string | undefined;
  ipAddress?: string | undefined;
}) {
  return prisma.refreshToken.create({ data });
}

export function findRefreshToken(tokenHash: string) {
  return prisma.refreshToken.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      userId: true,
      familyId: true,
      expiresAt: true,
      revokedAt: true,
    },
  });
}

export function revokeRefreshToken(id: string, replacedById?: string) {
  return prisma.refreshToken.update({
    where: { id },
    data: { revokedAt: new Date(), ...(replacedById ? { replacedById } : {}) },
  });
}

/** Kills an entire rotation chain — the response to a detected token reuse. */
export function revokeRefreshFamily(familyId: string) {
  return prisma.refreshToken.updateMany({
    where: { familyId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export function revokeAllUserRefreshTokens(userId: string) {
  return prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export function findAuthProvider(provider: string, providerUserId: string) {
  return prisma.authProvider.findUnique({
    where: { provider_providerUserId: { provider, providerUserId } },
    select: { userId: true },
  });
}
