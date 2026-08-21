import type { CookieOptions, Response } from 'express';
import { env } from '../config/env.js';

/**
 * The refresh token is the only long-lived credential the browser holds, and it
 * is intentionally invisible to JavaScript:
 *   - HttpOnly  — an XSS payload cannot read it.
 *   - Secure    — never sent over plaintext HTTP in production.
 *   - SameSite  — `lax` blocks cross-site POSTs; deployments that split the API
 *                 onto another site must switch to `none` (with HTTPS).
 *   - Path      — `/`, deliberately.
 *
 * The path was previously scoped to `/api/v1/auth` so the cookie would not ride
 * along on every API call. That saved a few bytes and broke server-side
 * rendering: the browser sends cookies to the Next server by *path*, so a
 * cookie scoped to `/api/v1/auth` is never sent to `/en/dashboard`. The server
 * therefore had no credential, could not identify the user, and every
 * authenticated page redirected to the login screen.
 *
 * Path scoping was never the control here — `HttpOnly` and `SameSite` are.
 * When the web app and API live on different hosts, set `COOKIE_DOMAIN` to the
 * shared parent domain so the cookie reaches both.
 */
export const REFRESH_COOKIE_NAME = 'academy_rt';
export const REFRESH_COOKIE_PATH = '/';

/** Non-sensitive hint used only to decide whether to attempt a silent refresh. */
export const SESSION_HINT_COOKIE_NAME = 'academy_session';

function baseCookieOptions(): CookieOptions {
  const options: CookieOptions = {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAMESITE,
    path: REFRESH_COOKIE_PATH,
  };
  if (env.COOKIE_DOMAIN) options.domain = env.COOKIE_DOMAIN;
  return options;
}

export function setRefreshCookie(res: Response, token: string, expiresAt: Date): void {
  res.cookie(REFRESH_COOKIE_NAME, token, { ...baseCookieOptions(), expires: expiresAt });

  // Readable by the client so it knows a session probably exists; carries no
  // authority of its own — the server never trusts it.
  res.cookie(SESSION_HINT_COOKIE_NAME, '1', {
    httpOnly: false,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAMESITE,
    path: '/',
    expires: expiresAt,
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
  });
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE_NAME, baseCookieOptions());
  res.clearCookie(SESSION_HINT_COOKIE_NAME, {
    httpOnly: false,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAMESITE,
    path: '/',
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
  });
}

export function readRefreshCookie(cookies: Record<string, string> | undefined): string | null {
  const value = cookies?.[REFRESH_COOKIE_NAME];
  return typeof value === 'string' && value.length > 0 ? value : null;
}
