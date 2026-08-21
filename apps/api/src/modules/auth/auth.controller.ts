import type { Request, Response } from 'express';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  requestOtpSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  verifyOtpSchema,
} from '@academy/validation';
import type { z } from 'zod';
import { FEATURE_KEYS } from '@academy/types';
import { env } from '../../config/env.js';
import { created, getClientIp, getUserAgent, noContent, ok } from '../../lib/http.js';
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from '../../lib/cookies.js';
import { AuthenticationError, BadRequestError, FeatureDisabledError } from '../../lib/errors.js';
import { signStatePayload, verifyStatePayload } from '../../lib/crypto.js';
import { isFeatureEnabled } from '../feature-flags/feature-flags.service.js';
import { getRequiredLegalVersions } from '../legal/legal.service.js';
import * as authService from './auth.service.js';
import {
  buildAuthorizeUrl,
  exchangeCodeForToken,
  getOAuthProvider,
  listEnabledProviders,
} from './oauth.providers.js';

/**
 * Controllers stay thin: read the (already validated) input, call one service
 * function, shape the HTTP response. Cookie handling lives here because it is
 * a transport concern the service should not know about.
 */

function respondWithSession(
  res: Response,
  result: { accessToken: string; accessTokenExpiresAt: string; user: unknown; refreshToken: string; refreshTokenExpiresAt: Date },
  statusCode = 200,
): Response {
  setRefreshCookie(res, result.refreshToken, result.refreshTokenExpiresAt);
  // The refresh token itself is never in the JSON body — it lives only in the
  // HttpOnly cookie, out of reach of any script on the page.
  return ok(
    res,
    {
      accessToken: result.accessToken,
      accessTokenExpiresAt: result.accessTokenExpiresAt,
      user: result.user,
    },
    statusCode,
  );
}

export async function register(req: Request, res: Response): Promise<void> {
  if (!(await isFeatureEnabled(FEATURE_KEYS.REGISTRATION))) {
    throw new FeatureDisabledError(FEATURE_KEYS.REGISTRATION);
  }

  const input = req.body as z.infer<typeof registerSchema>;

  // Acceptance is recorded against the exact document versions live right now,
  // so consent is auditable even after the documents change.
  const acceptedVersionIds = await getRequiredLegalVersions();

  const result = await authService.register({
    name: input.name,
    email: input.email,
    password: input.password,
    locale: input.locale ?? req.locale,
    marketingOptIn: input.marketingOptIn,
    acceptedVersionIds,
    ipAddress: getClientIp(req),
    userAgent: getUserAgent(req),
  });

  respondWithSession(res, result, 201);
}

export async function login(req: Request, res: Response): Promise<void> {
  const input = req.body as z.infer<typeof loginSchema>;

  const result = await authService.login({
    email: input.email,
    password: input.password,
    ipAddress: getClientIp(req),
    userAgent: getUserAgent(req),
  });

  respondWithSession(res, result);
}

export async function refresh(req: Request, res: Response): Promise<void> {
  const token = readRefreshCookie(req.cookies);
  if (!token) throw new AuthenticationError('No active session');

  try {
    const result = await authService.refreshSession(token, {
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
    });
    respondWithSession(res, result);
  } catch (error) {
    // A dead session must not leave a stale cookie behind, or the client will
    // retry the same doomed refresh forever.
    clearRefreshCookie(res);
    throw error;
  }
}

export async function logout(req: Request, res: Response): Promise<void> {
  await authService.logout(readRefreshCookie(req.cookies));
  clearRefreshCookie(res);
  noContent(res);
}

export async function logoutEverywhere(req: Request, res: Response): Promise<void> {
  await authService.logoutEverywhere(req.user!.id);
  clearRefreshCookie(res);
  noContent(res);
}

export async function me(req: Request, res: Response): Promise<void> {
  ok(res, await authService.getSessionUser(req.user!.id));
}

/**
 * Session lookup for server-side rendering.
 *
 * Authenticates from the refresh cookie rather than a bearer token, because the
 * Next server never sees the access token. Answers 200 with `null` for an
 * anonymous visitor instead of 401 — "nobody is signed in" is the expected case
 * when rendering a public page, not an error.
 */
export async function session(req: Request, res: Response): Promise<void> {
  const token = readRefreshCookie(req.cookies);
  if (!token) {
    ok(res, null);
    return;
  }
  ok(res, await authService.getSessionFromRefreshToken(token));
}

export async function verifyEmail(req: Request, res: Response): Promise<void> {
  const { token } = req.body as z.infer<typeof verifyEmailSchema>;
  await authService.verifyEmail(token);
  noContent(res);
}

export async function resendVerification(req: Request, res: Response): Promise<void> {
  const { email } = req.body as z.infer<typeof forgotPasswordSchema>;
  await authService.resendVerification(email);
  // Deliberately unconditional: the response must not reveal whether the
  // address is registered.
  ok(res, { message: 'If that address needs verification, we have sent a new link.' });
}

export async function forgotPassword(req: Request, res: Response): Promise<void> {
  const { email } = req.body as z.infer<typeof forgotPasswordSchema>;
  await authService.requestPasswordReset(email);
  ok(res, { message: 'If an account exists for that address, a reset link is on its way.' });
}

export async function resetPassword(req: Request, res: Response): Promise<void> {
  const { token, password } = req.body as z.infer<typeof resetPasswordSchema>;
  await authService.resetPassword(token, password);
  clearRefreshCookie(res);
  ok(res, { message: 'Your password has been updated. Please sign in.' });
}

export async function changePassword(req: Request, res: Response): Promise<void> {
  const { currentPassword, newPassword } = req.body as z.infer<typeof changePasswordSchema>;
  await authService.changePassword(req.user!.id, currentPassword, newPassword);
  clearRefreshCookie(res);
  ok(res, { message: 'Password updated. Please sign in again.' });
}

export async function requestOtp(req: Request, res: Response): Promise<void> {
  const { email } = req.body as z.infer<typeof requestOtpSchema>;
  await authService.requestOtp(email);
  ok(res, { message: 'If an account exists for that address, a code is on its way.' });
}

export async function verifyOtp(req: Request, res: Response): Promise<void> {
  const { email, code } = req.body as z.infer<typeof verifyOtpSchema>;
  const result = await authService.verifyOtp(email, code, {
    ipAddress: getClientIp(req),
    userAgent: getUserAgent(req),
  });
  respondWithSession(res, result);
}

/* --------------------------------------------------------------------- OAuth */

export function listProviders(_req: Request, res: Response): void {
  ok(res, { providers: listEnabledProviders() });
}

/**
 * Starts the authorization-code flow.
 *
 * The `state` parameter is an HMAC-signed, short-lived payload rather than a
 * random value in a session store: it carries the post-login redirect and a
 * nonce, and the signature is what makes the callback CSRF-resistant.
 */
export async function oauthStart(req: Request, res: Response): Promise<void> {
  const providerId = req.params.provider ?? '';
  const featureKey =
    providerId === 'google' ? FEATURE_KEYS.OAUTH_GOOGLE : FEATURE_KEYS.OAUTH_GITHUB;
  if (!(await isFeatureEnabled(featureKey))) throw new FeatureDisabledError(featureKey);

  const provider = getOAuthProvider(providerId);

  const requestedRedirect = typeof req.query.redirect === 'string' ? req.query.redirect : '/dashboard';
  // Only site-relative paths are honoured, so the callback can never be turned
  // into an open redirect to an attacker-controlled host.
  const redirectTo = requestedRedirect.startsWith('/') && !requestedRedirect.startsWith('//')
    ? requestedRedirect
    : '/dashboard';

  const state = signStatePayload({ provider: provider.id, redirectTo, locale: req.locale });
  res.redirect(buildAuthorizeUrl(provider, state));
}

export async function oauthCallback(req: Request, res: Response): Promise<void> {
  const providerId = req.params.provider ?? '';
  const code = typeof req.query.code === 'string' ? req.query.code : null;
  const state = typeof req.query.state === 'string' ? req.query.state : null;

  const failureUrl = `${env.WEB_PUBLIC_URL}/login?error=oauth_failed`;

  if (!code || !state) {
    res.redirect(failureUrl);
    return;
  }

  const statePayload = verifyStatePayload<{ provider: string; redirectTo: string }>(state);
  if (!statePayload || statePayload.provider !== providerId) {
    res.redirect(failureUrl);
    return;
  }

  try {
    const provider = getOAuthProvider(providerId);
    const accessToken = await exchangeCodeForToken(provider, code);
    const profile = await provider.fetchProfile(accessToken);

    const result = await authService.resolveOAuthUser(profile, {
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
    });

    setRefreshCookie(res, result.refreshToken, result.refreshTokenExpiresAt);

    // The browser is bounced to a web-app route that immediately calls
    // /auth/refresh to obtain an access token. The token is never placed in the
    // URL, where it would end up in history and referrer headers.
    const target = new URL('/auth/callback', env.WEB_PUBLIC_URL);
    target.searchParams.set('redirect', statePayload.redirectTo);
    res.redirect(target.toString());
  } catch (error) {
    if (error instanceof BadRequestError) {
      res.redirect(`${env.WEB_PUBLIC_URL}/login?error=oauth_failed`);
      return;
    }
    throw error;
  }
}

export function health(_req: Request, res: Response): void {
  created(res, { status: 'ok' });
}
