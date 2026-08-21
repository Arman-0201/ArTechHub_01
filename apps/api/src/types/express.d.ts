import type { Permission } from '@academy/types';

/**
 * The authenticated principal attached by `authenticate`.
 *
 * Permissions are resolved from the database on every request rather than read
 * from the token, so a revoked role stops granting access immediately.
 */
export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  status: string;
  emailVerified: boolean;
  locale: string;
  tokenVersion: number;
  roleSlugs: string[];
  permissions: Set<Permission>;
  isSuperAdmin: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Present only after `authenticate` has run and succeeded. */
      user?: AuthenticatedUser;
      /** Correlation id echoed in error responses and every log line. */
      requestId: string;
      /** Locale negotiated from the path, query, header or user preference. */
      locale: string;
    }
  }
}

export {};
