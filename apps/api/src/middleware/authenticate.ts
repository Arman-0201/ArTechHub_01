import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { SUPER_ADMIN_ROLE, type Permission } from '@academy/types';
import { prisma } from '../lib/prisma.js';
import { verifyAccessToken } from '../lib/jwt.js';
import { hashToken } from '../lib/crypto.js';
import { readRefreshCookie } from '../lib/cookies.js';
import { AuthenticationError, AuthorizationError } from '../lib/errors.js';
import { logSecurityEvent } from '../lib/logger.js';
import type { AuthenticatedUser } from '../types/express.js';

function extractBearerToken(req: Request): string | null {
  const header = req.get('authorization');
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) return null;
  return token.trim() || null;
}

const principalSelect = {
  id: true,
  email: true,
  name: true,
  status: true,
  emailVerified: true,
  locale: true,
  tokenVersion: true,
  roles: {
    select: {
      role: {
        select: {
          slug: true,
          permissions: { select: { permission: { select: { key: true } } } },
        },
      },
    },
  },
} as const;

type PrincipalRow = {
  id: string;
  email: string;
  name: string;
  status: string;
  emailVerified: boolean;
  locale: string;
  tokenVersion: number;
  roles: { role: { slug: string; permissions: { permission: { key: string } }[] } }[];
};

function buildPrincipal(user: PrincipalRow): AuthenticatedUser {
  const roleSlugs = user.roles.map((entry) => entry.role.slug);

  // Permissions are always read from the database, never from the token, so a
  // role change takes effect on the next request rather than at token expiry.
  const permissions = new Set<Permission>();
  for (const entry of user.roles) {
    for (const link of entry.role.permissions) {
      permissions.add(link.permission.key as Permission);
    }
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    status: user.status,
    emailVerified: user.emailVerified,
    locale: user.locale,
    tokenVersion: user.tokenVersion,
    roleSlugs,
    permissions,
    isSuperAdmin: roleSlugs.includes(SUPER_ADMIN_ROLE),
  };
}

/**
 * Principal behind a bearer access token.
 *
 * Exported because the WebSocket handshake needs the same resolution as an HTTP
 * request: the token proves who is asking, and the database says what they may
 * do right now. A socket that trusted the token's own claims would keep a
 * revoked role alive until it disconnected.
 */
export async function resolvePrincipalFromAccessToken(
  token: string,
): Promise<AuthenticatedUser | null> {
  const claims = verifyAccessToken(token);

  const user = await prisma.user.findFirst({
    where: { id: claims.sub, deletedAt: null },
    select: principalSelect,
  });
  if (!user) return null;

  // A token minted before the version bump is stale: the user logged out
  // everywhere, changed their password, or had their roles changed.
  if (user.tokenVersion !== claims.ver) return null;

  return buildPrincipal(user);
}

/**
 * Principal behind a refresh cookie.
 *
 * No version comparison here: the refresh token's own revocation state is the
 * source of truth, and every path that bumps `tokenVersion` for a security
 * reason (logout-everywhere, password change or reset, account suspension)
 * revokes the refresh tokens in the same transaction. A role change bumps the
 * version without revoking, which is deliberate — a permission change should
 * not sign someone out — and permissions are re-read above regardless.
 */
async function resolveFromRefreshCookie(token: string): Promise<AuthenticatedUser | null> {
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { userId: true, revokedAt: true, expiresAt: true },
  });
  if (!stored || stored.revokedAt || stored.expiresAt <= new Date()) return null;

  const user = await prisma.user.findFirst({
    where: { id: stored.userId, deletedAt: null },
    select: principalSelect,
  });
  if (!user) return null;

  return buildPrincipal(user);
}

/**
 * Identifies the caller.
 *
 * Two credentials are accepted, and the asymmetry between them is deliberate:
 *
 *   - A bearer access token authenticates any request. This is what the browser
 *     uses, and it is the only way to authenticate a write.
 *
 *   - The refresh cookie authenticates GET and HEAD only. Server-side rendering
 *     needs this: the Next server holds cookies but never the access token,
 *     which lives in browser memory, so without it no authenticated page could
 *     be rendered on the server at all.
 *
 * Restricting the cookie to safe methods is what keeps this from being a CSRF
 * hole. `SameSite=Lax` already blocks cross-site writes, and a cross-site page
 * cannot read the response to a top-level GET navigation — so cookie-authorised
 * reads are not exploitable, while cookie-authorised writes would be a genuine
 * surface. Writes stay bearer-only.
 *
 * Returns null rather than throwing for every "not a valid session" case, so
 * the caller decides whether that is fatal — `optionalAuth` tolerates it,
 * `authenticate` does not.
 */
async function resolveUserFromRequest(req: Request): Promise<AuthenticatedUser | null> {
  const bearer = extractBearerToken(req);
  if (bearer) return resolvePrincipalFromAccessToken(bearer);

  if (req.method === 'GET' || req.method === 'HEAD') {
    const refresh = readRefreshCookie(req.cookies);
    if (refresh) return resolveFromRefreshCookie(refresh);
  }

  return null;
}

/** Rejects the request unless a valid, active session is present. */
export const authenticate: RequestHandler = (req, _res, next) => {
  void (async () => {
    try {
      const user = await resolveUserFromRequest(req);
      if (!user) throw new AuthenticationError();

      if (user.status === 'SUSPENDED') {
        throw new AuthorizationError('This account has been suspended');
      }
      if (user.status === 'INACTIVE') {
        throw new AuthorizationError('This account is deactivated');
      }

      req.user = user;
      next();
    } catch (error) {
      next(error);
    }
  })();
};

/**
 * Attaches the principal when one is present but never fails.
 * Used by public endpoints that personalise their response (course pages
 * showing enrollment state, menus filtered by role).
 */
export const optionalAuth: RequestHandler = (req, _res, next) => {
  void (async () => {
    try {
      const user = await resolveUserFromRequest(req);
      if (user && user.status !== 'SUSPENDED' && user.status !== 'INACTIVE') {
        req.user = user;
      }
    } catch {
      // An expired or malformed token is simply "no session" here.
    }
    next();
  })();
};

/** Guards actions that must not be performed by an unverified account. */
export const requireVerifiedEmail: RequestHandler = (req, _res, next) => {
  if (!req.user) {
    next(new AuthenticationError());
    return;
  }
  if (!req.user.emailVerified) {
    next(new AuthorizationError('Please verify your email address to continue'));
    return;
  }
  next();
};

export function userHasPermission(user: AuthenticatedUser, permission: Permission): boolean {
  return user.isSuperAdmin || user.permissions.has(permission);
}

/**
 * Requires every listed permission. Super admins bypass the check by design —
 * the role exists so an operator can never lock themselves out of the platform.
 */
export function requirePermissions(...required: Permission[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) {
      next(new AuthenticationError());
      return;
    }

    const missing = required.filter((permission) => !userHasPermission(user, permission));
    if (missing.length > 0) {
      logSecurityEvent('authz.denied', {
        userId: user.id,
        path: req.originalUrl,
        method: req.method,
        missing,
      });
      next(new AuthorizationError());
      return;
    }

    next();
  };
}

/** Requires at least one of the listed permissions. */
export function requireAnyPermission(...allowed: Permission[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) {
      next(new AuthenticationError());
      return;
    }
    if (allowed.some((permission) => userHasPermission(user, permission))) {
      next();
      return;
    }
    logSecurityEvent('authz.denied', {
      userId: req.user?.id,
      path: req.originalUrl,
      method: req.method,
      allowed,
    });
    next(new AuthorizationError());
  };
}

/**
 * Gate for the admin area as a whole. Holding *any* admin-side permission is
 * enough to open `/admin`; individual screens still check their own permission.
 */
export const requireAdminAccess: RequestHandler = (req, _res, next) => {
  const user = req.user;
  if (!user) {
    next(new AuthenticationError());
    return;
  }
  if (user.isSuperAdmin || user.permissions.size > 0) {
    next();
    return;
  }
  next(new AuthorizationError());
};

export const requireSuperAdmin: RequestHandler = (req, _res, next) => {
  if (!req.user) {
    next(new AuthenticationError());
    return;
  }
  if (!req.user.isSuperAdmin) {
    next(new AuthorizationError('This action requires super administrator access'));
    return;
  }
  next();
};
