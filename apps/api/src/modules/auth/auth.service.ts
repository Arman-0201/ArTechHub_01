import crypto from 'node:crypto';
import type { Prisma } from '@prisma/client';
import {
  SUPER_ADMIN_ROLE,
  SYSTEM_ROLES,
  type AuthResultDto,
  type Permission,
  type SessionUserDto,
} from '@academy/types';
import { prisma } from '../../lib/prisma.js';
import { env } from '../../config/env.js';
import {
  AuthenticationError,
  AuthorizationError,
  BadRequestError,
  ConflictError,
  NotFoundError,
} from '../../lib/errors.js';
import { logSecurityEvent, logger } from '../../lib/logger.js';
import {
  fakePasswordVerification,
  generateOpaqueToken,
  generateOtpCode,
  hashPassword,
  hashToken,
  verifyPassword,
} from '../../lib/crypto.js';
import { signAccessToken } from '../../lib/jwt.js';
import {
  buildOtpEmail,
  buildPasswordResetEmail,
  buildVerificationEmail,
  sendMail,
} from '../../lib/mailer.js';
import { resolveMediaUrl } from '../media/media.helpers.js';
import { getSettings } from '../settings/settings.service.js';
import { disconnectUser } from '../../realtime/hub.js';
import * as repository from './auth.repository.js';
import type { SessionUserRow } from './auth.repository.js';

/* -------------------------------------------------------------- constants */

const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;

/**
 * Account lockout. After this many consecutive failures the account is locked
 * for a fixed window. This complements — it does not replace — the per-IP rate
 * limiter: the limiter stops one host spraying many accounts, the lockout stops
 * a distributed attack grinding one account.
 */
const MAX_FAILED_LOGINS = 8;
const LOCKOUT_MS = 15 * 60 * 1000;

/* ---------------------------------------------------------------- mapping */

export function toSessionUser(user: SessionUserRow): SessionUserDto {
  const roles = user.roles.map((entry) => ({
    id: entry.role.id,
    slug: entry.role.slug,
    name: entry.role.name,
  }));

  const permissionSet = new Set<Permission>();
  for (const entry of user.roles) {
    for (const link of entry.role.permissions) {
      permissionSet.add(link.permission.key as Permission);
    }
  }

  const isSuperAdmin = roles.some((role) => role.slug === SUPER_ADMIN_ROLE);
  const permissions = [...permissionSet];

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatar ? resolveMediaUrl(user.avatar) : null,
    status: user.status,
    emailVerified: user.emailVerified,
    locale: user.locale,
    roles,
    permissions,
    isSuperAdmin,
    canAccessAdmin: isSuperAdmin || permissions.length > 0,
  };
}

/* ------------------------------------------------------------ token issuing */

export interface IssuedSession {
  accessToken: string;
  accessTokenExpiresAt: Date;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

/**
 * Mints an access token plus a refresh token.
 *
 * `familyId` ties a refresh token to its rotation chain. A brand-new login
 * starts a new family; a refresh continues the existing one.
 */
async function issueSession(
  userId: string,
  tokenVersion: number,
  context: { userAgent?: string | undefined; ipAddress?: string | undefined; familyId?: string },
): Promise<IssuedSession> {
  const access = signAccessToken(userId, tokenVersion);

  const refreshToken = generateOpaqueToken(48);
  const refreshTokenExpiresAt = new Date(
    Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  );

  await repository.createRefreshToken({
    userId,
    tokenHash: hashToken(refreshToken),
    familyId: context.familyId ?? crypto.randomUUID(),
    expiresAt: refreshTokenExpiresAt,
    userAgent: context.userAgent,
    ipAddress: context.ipAddress,
  });

  return {
    accessToken: access.token,
    accessTokenExpiresAt: access.expiresAt,
    refreshToken,
    refreshTokenExpiresAt,
  };
}

function toAuthResult(user: SessionUserRow, session: IssuedSession): AuthResultDto {
  return {
    accessToken: session.accessToken,
    accessTokenExpiresAt: session.accessTokenExpiresAt.toISOString(),
    user: toSessionUser(user),
  };
}

/* -------------------------------------------------------------- email flows */

async function issueEmailVerification(user: { id: string; email: string; name: string }): Promise<void> {
  await repository.consumeOutstandingTokens(user.id, 'EMAIL_VERIFICATION');

  const token = generateOpaqueToken(32);
  await repository.createVerificationToken({
    userId: user.id,
    purpose: 'EMAIL_VERIFICATION',
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
  });

  const settings = await getSettings();
  const url = `${env.WEB_PUBLIC_URL}/verify-account?token=${encodeURIComponent(token)}`;
  const message = buildVerificationEmail(user.name, url, settings.siteName);
  await sendMail({ ...message, to: user.email });
}

/* ------------------------------------------------------------------ register */

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  locale?: string;
  marketingOptIn: boolean;
  acceptedVersionIds: string[];
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
}

export async function register(
  input: RegisterInput,
): Promise<AuthResultDto & { refreshToken: string; refreshTokenExpiresAt: Date }> {
  const email = input.email.toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    // Registration is not an enumeration oracle we can fully close (the user
    // has to be told the address is taken), but the message stays generic and
    // the endpoint is rate limited.
    throw new ConflictError('An account with this email already exists', {
      email: ['This email is already registered'],
    });
  }

  const studentRole = await prisma.role.findUnique({
    where: { slug: SYSTEM_ROLES.STUDENT },
    select: { id: true },
  });
  if (!studentRole) {
    throw new Error('Student role is missing — run the database seed');
  }

  const passwordHash = await hashPassword(input.password);

  const user = await prisma.user.create({
    data: {
      email,
      name: input.name,
      passwordHash,
      locale: input.locale ?? 'en',
      // PENDING until the address is verified; the account can still sign in,
      // but `requireVerifiedEmail` gates enrollment and other real actions.
      status: 'PENDING',
      marketingOptIn: input.marketingOptIn,
      roles: { create: { roleId: studentRole.id } },
      legalAcceptances: {
        create: input.acceptedVersionIds.map((versionId) => ({
          versionId,
          ipAddress: input.ipAddress ?? null,
        })),
      },
    },
    select: repository.sessionUserSelect,
  });

  await issueEmailVerification({ id: user.id, email: user.email, name: user.name });

  const session = await issueSession(user.id, user.tokenVersion, {
    userAgent: input.userAgent,
    ipAddress: input.ipAddress,
  });

  logSecurityEvent('auth.register', { userId: user.id, ip: input.ipAddress });

  return {
    ...toAuthResult(user, session),
    refreshToken: session.refreshToken,
    refreshTokenExpiresAt: session.refreshTokenExpiresAt,
  };
}

/* --------------------------------------------------------------------- login */

export interface LoginInput {
  email: string;
  password: string;
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
}

export async function login(
  input: LoginInput,
): Promise<AuthResultDto & { refreshToken: string; refreshTokenExpiresAt: Date }> {
  const user = await repository.findUserByEmail(input.email);

  if (!user || !user.passwordHash) {
    // Spend the same time as a real verification so response latency does not
    // reveal whether the address exists.
    await fakePasswordVerification();
    logSecurityEvent('auth.login.failed', { email: input.email, ip: input.ipAddress, reason: 'unknown_user' });
    throw new AuthenticationError('Invalid email or password');
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    logSecurityEvent('auth.login.locked', { userId: user.id, ip: input.ipAddress });
    throw new AuthenticationError(
      'Too many failed attempts. Please try again in a few minutes.',
    );
  }

  const passwordMatches = await verifyPassword(input.password, user.passwordHash);

  if (!passwordMatches) {
    const failedLoginCount = user.failedLoginCount + 1;
    const shouldLock = failedLoginCount >= MAX_FAILED_LOGINS;

    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount,
        lockedUntil: shouldLock ? new Date(Date.now() + LOCKOUT_MS) : null,
      },
    });

    logSecurityEvent('auth.login.failed', {
      userId: user.id,
      ip: input.ipAddress,
      failedLoginCount,
      locked: shouldLock,
    });
    throw new AuthenticationError('Invalid email or password');
  }

  if (user.status === 'SUSPENDED') {
    throw new AuthorizationError('This account has been suspended');
  }
  if (user.status === 'INACTIVE') {
    throw new AuthorizationError('This account is deactivated');
  }

  const now = new Date();
  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: now, lastActiveAt: now },
  });

  const session = await issueSession(user.id, user.tokenVersion, {
    userAgent: input.userAgent,
    ipAddress: input.ipAddress,
  });

  logSecurityEvent('auth.login.success', { userId: user.id, ip: input.ipAddress });

  return {
    ...toAuthResult(user, session),
    refreshToken: session.refreshToken,
    refreshTokenExpiresAt: session.refreshTokenExpiresAt,
  };
}

/* ------------------------------------------------------------------- refresh */

/**
 * Refresh-token rotation with reuse detection.
 *
 * Every refresh revokes the presented token and issues a new one in the same
 * family. If a token that has already been revoked is presented again, either
 * the network was replayed or the token was stolen — in both cases the safe
 * response is to revoke the entire family, forcing a fresh login.
 */
export async function refreshSession(
  presentedToken: string,
  context: { ipAddress?: string | undefined; userAgent?: string | undefined },
): Promise<AuthResultDto & { refreshToken: string; refreshTokenExpiresAt: Date }> {
  const tokenHash = hashToken(presentedToken);
  const stored = await repository.findRefreshToken(tokenHash);

  if (!stored) throw new AuthenticationError('Session expired, please sign in again');

  if (stored.revokedAt) {
    await repository.revokeRefreshFamily(stored.familyId);
    // Bumping the version also kills every access token already handed out.
    await prisma.user.update({
      where: { id: stored.userId },
      data: { tokenVersion: { increment: 1 } },
    });
    disconnectUser(stored.userId, 'Session revoked');
    logSecurityEvent('auth.refresh.reuse_detected', {
      userId: stored.userId,
      familyId: stored.familyId,
      ip: context.ipAddress,
    });
    throw new AuthenticationError('Session expired, please sign in again');
  }

  if (stored.expiresAt <= new Date()) {
    throw new AuthenticationError('Session expired, please sign in again');
  }

  const user = await repository.findSessionUserById(stored.userId);
  if (!user) throw new AuthenticationError('Session expired, please sign in again');
  if (user.status === 'SUSPENDED' || user.status === 'INACTIVE') {
    await repository.revokeRefreshFamily(stored.familyId);
    throw new AuthorizationError('This account is no longer active');
  }

  const session = await issueSession(user.id, user.tokenVersion, {
    ...context,
    familyId: stored.familyId,
  });

  await repository.revokeRefreshToken(stored.id);
  await prisma.user.update({ where: { id: user.id }, data: { lastActiveAt: new Date() } });

  return {
    ...toAuthResult(user, session),
    refreshToken: session.refreshToken,
    refreshTokenExpiresAt: session.refreshTokenExpiresAt,
  };
}

/**
 * Resolves the session behind a refresh cookie, read-only.
 *
 * This exists for server-side rendering. The Next server holds only cookies —
 * the access token lives in browser memory and never reaches it — so it needs
 * a way to ask "who is this?" without minting or rotating anything.
 *
 * It deliberately does NOT reuse `refreshSession`:
 *   - rotation on every page render would churn tokens constantly;
 *   - a Server Component cannot set the replacement cookie, so the browser
 *     would keep the old value and the next genuine refresh would look like
 *     token reuse — logging the user out everywhere.
 *
 * For the same reason a revoked token returns null here rather than triggering
 * reuse detection: a read must never revoke a session family.
 */
export async function getSessionFromRefreshToken(
  presentedToken: string,
): Promise<SessionUserDto | null> {
  const stored = await repository.findRefreshToken(hashToken(presentedToken));
  if (!stored || stored.revokedAt || stored.expiresAt <= new Date()) return null;

  const user = await repository.findSessionUserById(stored.userId);
  if (!user) return null;
  if (user.status === 'SUSPENDED' || user.status === 'INACTIVE') return null;

  return toSessionUser(user);
}

/* -------------------------------------------------------------------- logout */

export async function logout(presentedToken: string | null): Promise<void> {
  if (!presentedToken) return;
  const stored = await repository.findRefreshToken(hashToken(presentedToken));
  if (!stored) return;
  // Revoke the whole family: signing out should end this device's session
  // completely, not just the newest link in the chain.
  await repository.revokeRefreshFamily(stored.familyId);
  logSecurityEvent('auth.logout', { userId: stored.userId });
}

export async function logoutEverywhere(userId: string): Promise<void> {
  await repository.revokeAllUserRefreshTokens(userId);
  await prisma.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } });
  // "Everywhere" has to include the live feed, or the one thing still running
  // after a panicked sign-out-everywhere is the socket.
  disconnectUser(userId, 'Signed out everywhere');
  logSecurityEvent('auth.logout', { userId, scope: 'all' });
}

/* -------------------------------------------------------- email verification */

export async function resendVerification(email: string): Promise<void> {
  const user = await prisma.user.findFirst({
    where: { email: email.toLowerCase(), deletedAt: null },
    select: { id: true, email: true, name: true, emailVerified: true },
  });

  // Silent success: the caller must not learn whether the address exists.
  if (!user || user.emailVerified) return;

  await issueEmailVerification(user);
}

export async function verifyEmail(token: string): Promise<void> {
  const record = await repository.findLiveVerificationToken(
    hashToken(token),
    'EMAIL_VERIFICATION',
  );
  if (!record) throw new BadRequestError('This verification link is invalid or has expired');

  await prisma.$transaction([
    prisma.verificationToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    prisma.user.update({
      where: { id: record.userId },
      data: {
        emailVerified: true,
        // A PENDING account becomes ACTIVE on verification; a SUSPENDED one
        // must stay suspended.
        status: 'ACTIVE',
      },
    }),
  ]);

  logSecurityEvent('auth.email.verified', { userId: record.userId });
}

/* -------------------------------------------------------------- password flow */

export async function requestPasswordReset(email: string): Promise<void> {
  const user = await prisma.user.findFirst({
    where: { email: email.toLowerCase(), deletedAt: null },
    select: { id: true, email: true, name: true },
  });

  // Always return success to the caller; only send mail when the account exists.
  if (!user) {
    logSecurityEvent('auth.password.reset_requested', { email, found: false });
    return;
  }

  await repository.consumeOutstandingTokens(user.id, 'PASSWORD_RESET');

  const token = generateOpaqueToken(32);
  await repository.createVerificationToken({
    userId: user.id,
    purpose: 'PASSWORD_RESET',
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
  });

  const settings = await getSettings();
  const url = `${env.WEB_PUBLIC_URL}/reset-password?token=${encodeURIComponent(token)}`;
  const message = buildPasswordResetEmail(user.name, url, settings.siteName);
  await sendMail({ ...message, to: user.email });

  logSecurityEvent('auth.password.reset_requested', { userId: user.id, found: true });
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const record = await repository.findLiveVerificationToken(hashToken(token), 'PASSWORD_RESET');
  if (!record) throw new BadRequestError('This reset link is invalid or has expired');

  const passwordHash = await hashPassword(newPassword);

  await prisma.$transaction([
    prisma.verificationToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    prisma.user.update({
      where: { id: record.userId },
      data: {
        passwordHash,
        failedLoginCount: 0,
        lockedUntil: null,
        // Whoever reset the password owns the account now; every existing
        // session elsewhere is invalidated.
        tokenVersion: { increment: 1 },
      },
    }),
    prisma.refreshToken.updateMany({
      where: { userId: record.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  // Whoever reset the password owns the account now, so the sockets opened by
  // whoever held it before must go with the sessions.
  disconnectUser(record.userId, 'Password reset');

  logSecurityEvent('auth.password.reset_completed', { userId: record.userId });
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, passwordHash: true },
  });
  if (!user) throw new NotFoundError('User');

  if (!user.passwordHash) {
    throw new BadRequestError(
      'This account signs in with a social provider. Set a password from your profile first.',
    );
  }

  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw new AuthenticationError('Your current password is incorrect');
  }

  const passwordHash = await hashPassword(newPassword);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { passwordHash, tokenVersion: { increment: 1 } },
    }),
    prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  disconnectUser(userId, 'Password changed');

  logSecurityEvent('auth.password.changed', { userId });
}

/* ----------------------------------------------------------------------- OTP */

export async function requestOtp(email: string): Promise<void> {
  const user = await prisma.user.findFirst({
    where: { email: email.toLowerCase(), deletedAt: null },
    select: { id: true, email: true, name: true },
  });
  if (!user) return;

  await repository.consumeOutstandingTokens(user.id, 'OTP_LOGIN');

  const code = generateOtpCode();
  await repository.createVerificationToken({
    userId: user.id,
    purpose: 'OTP_LOGIN',
    tokenHash: hashToken(code),
    expiresAt: new Date(Date.now() + OTP_TTL_MS),
  });

  const settings = await getSettings();
  const message = buildOtpEmail(user.name, code, settings.siteName);
  await sendMail({ ...message, to: user.email });
}

export async function verifyOtp(
  email: string,
  code: string,
  context: { ipAddress?: string | undefined; userAgent?: string | undefined },
): Promise<AuthResultDto & { refreshToken: string; refreshTokenExpiresAt: Date }> {
  const user = await prisma.user.findFirst({
    where: { email: email.toLowerCase(), deletedAt: null },
    select: { id: true },
  });
  if (!user) throw new BadRequestError('That code is invalid or has expired');

  const record = await prisma.verificationToken.findFirst({
    where: { userId: user.id, purpose: 'OTP_LOGIN', usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  if (!record) throw new BadRequestError('That code is invalid or has expired');

  if (record.attempts >= OTP_MAX_ATTEMPTS) {
    await repository.markTokenUsed(record.id);
    logSecurityEvent('auth.otp.failed', { userId: user.id, reason: 'attempts_exhausted' });
    throw new BadRequestError('Too many incorrect attempts. Request a new code.');
  }

  if (record.tokenHash !== hashToken(code)) {
    await prisma.verificationToken.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } },
    });
    logSecurityEvent('auth.otp.failed', { userId: user.id, reason: 'mismatch' });
    throw new BadRequestError('That code is invalid or has expired');
  }

  await repository.markTokenUsed(record.id);

  const sessionUser = await repository.findSessionUserById(user.id);
  if (!sessionUser) throw new NotFoundError('User');

  const now = new Date();
  await prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerified: true,
      status: sessionUser.status === 'PENDING' ? 'ACTIVE' : sessionUser.status,
      lastLoginAt: now,
      lastActiveAt: now,
      failedLoginCount: 0,
      lockedUntil: null,
    },
  });

  const session = await issueSession(sessionUser.id, sessionUser.tokenVersion, context);

  return {
    ...toAuthResult(sessionUser, session),
    refreshToken: session.refreshToken,
    refreshTokenExpiresAt: session.refreshTokenExpiresAt,
  };
}

/* --------------------------------------------------------------------- OAuth */

export interface OAuthProfile {
  provider: string;
  providerUserId: string;
  email: string | null;
  name: string;
  avatarUrl: string | null;
  emailVerified: boolean;
}

/**
 * Resolves an OAuth profile to a local account, in this order:
 *   1. an existing link for (provider, providerUserId);
 *   2. an existing local account with the same *verified* email — the link is
 *      added. Linking on an unverified provider email would let an attacker
 *      take over an account by registering that address at the provider;
 *   3. a brand-new account.
 */
export async function resolveOAuthUser(
  profile: OAuthProfile,
  context: { ipAddress?: string | undefined; userAgent?: string | undefined },
): Promise<AuthResultDto & { refreshToken: string; refreshTokenExpiresAt: Date }> {
  const link = await repository.findAuthProvider(profile.provider, profile.providerUserId);

  let userId = link?.userId ?? null;

  if (!userId && profile.email && profile.emailVerified) {
    const existing = await prisma.user.findFirst({
      where: { email: profile.email.toLowerCase(), deletedAt: null },
      select: { id: true },
    });
    if (existing) {
      userId = existing.id;
      await prisma.authProvider.create({
        data: {
          userId: existing.id,
          provider: profile.provider,
          providerUserId: profile.providerUserId,
          email: profile.email,
        },
      });
      logSecurityEvent('auth.oauth.linked', { userId, provider: profile.provider });
    }
  }

  if (!userId) {
    if (!profile.email) {
      throw new BadRequestError(
        'Your provider did not share an email address. Please register with email instead.',
      );
    }

    const studentRole = await prisma.role.findUnique({
      where: { slug: SYSTEM_ROLES.STUDENT },
      select: { id: true },
    });
    if (!studentRole) throw new Error('Student role is missing — run the database seed');

    const created = await prisma.user.create({
      data: {
        email: profile.email.toLowerCase(),
        name: profile.name,
        emailVerified: profile.emailVerified,
        status: profile.emailVerified ? 'ACTIVE' : 'PENDING',
        // No password: this account can only sign in through the provider until
        // the user sets one from their profile.
        passwordHash: null,
        roles: { create: { roleId: studentRole.id } },
        authProviders: {
          create: {
            provider: profile.provider,
            providerUserId: profile.providerUserId,
            email: profile.email,
          },
        },
      },
      select: { id: true },
    });
    userId = created.id;
  }

  const user = await repository.findSessionUserById(userId);
  if (!user) throw new NotFoundError('User');
  if (user.status === 'SUSPENDED' || user.status === 'INACTIVE') {
    throw new AuthorizationError('This account is no longer active');
  }

  const now = new Date();
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: now, lastActiveAt: now },
  });

  const session = await issueSession(user.id, user.tokenVersion, context);

  return {
    ...toAuthResult(user, session),
    refreshToken: session.refreshToken,
    refreshTokenExpiresAt: session.refreshTokenExpiresAt,
  };
}

/* --------------------------------------------------------------------- misc */

export async function getSessionUser(userId: string): Promise<SessionUserDto> {
  const user = await repository.findSessionUserById(userId);
  if (!user) throw new NotFoundError('User');
  return toSessionUser(user);
}

/** Removes expired tokens; run periodically by the maintenance job. */
export async function pruneExpiredTokens(): Promise<{ refresh: number; verification: number }> {
  const now = new Date();
  const [refresh, verification] = await prisma.$transaction([
    prisma.refreshToken.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.verificationToken.deleteMany({ where: { expiresAt: { lt: now } } }),
  ]);
  logger.debug({ refresh: refresh.count, verification: verification.count }, 'Pruned expired tokens');
  return { refresh: refresh.count, verification: verification.count };
}

export type { Prisma };
