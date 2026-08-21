'use client';

import type { ApiErrorBody, ApiResponse, AuthResultDto } from '@academy/types';
import { ApiError, buildQueryString, type ApiResult, type RequestOptions } from './types';

/**
 * Browser API client.
 *
 * Session model:
 *   - The refresh token lives in an HttpOnly cookie. This module never sees it.
 *   - The access token is held in a module-level variable — memory only, never
 *     localStorage — so an XSS payload cannot read a persisted credential, and
 *     a closed tab leaves nothing behind.
 *   - On a 401 the client silently refreshes once and replays the request.
 *     Concurrent 401s share a single refresh (see `refreshPromise`) rather than
 *     stampeding the endpoint and invalidating each other's rotated tokens.
 */

const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/+$/, '');

let accessToken: string | null = null;
let accessTokenExpiresAt = 0;
let currentLocale = 'en';

/** Notified when the session ends, so the UI can redirect to sign-in. */
type SessionListener = (session: AuthResultDto | null) => void;
const sessionListeners = new Set<SessionListener>();

export function onSessionChange(listener: SessionListener): () => void {
  sessionListeners.add(listener);
  return () => sessionListeners.delete(listener);
}

function emitSessionChange(session: AuthResultDto | null): void {
  for (const listener of sessionListeners) listener(session);
}

export function setAccessToken(token: string | null, expiresAt?: string): void {
  accessToken = token;
  accessTokenExpiresAt = expiresAt ? new Date(expiresAt).getTime() : 0;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function setClientLocale(locale: string): void {
  currentLocale = locale;
}

/** True when the token is gone or within 30s of expiring. */
function accessTokenIsStale(): boolean {
  if (!accessToken) return true;
  return accessTokenExpiresAt > 0 && accessTokenExpiresAt - Date.now() < 30_000;
}

let refreshPromise: Promise<AuthResultDto | null> | null = null;

async function performRefresh(): Promise<AuthResultDto | null> {
  try {
    const response = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
      method: 'POST',
      // The refresh cookie is scoped to this path and must be sent.
      credentials: 'include',
      headers: { accept: 'application/json' },
    });

    if (!response.ok) {
      setAccessToken(null);
      emitSessionChange(null);
      return null;
    }

    const payload = (await response.json()) as ApiResponse<AuthResultDto>;
    if (!payload.success) {
      setAccessToken(null);
      emitSessionChange(null);
      return null;
    }

    setAccessToken(payload.data.accessToken, payload.data.accessTokenExpiresAt);
    emitSessionChange(payload.data);
    return payload.data;
  } catch {
    setAccessToken(null);
    emitSessionChange(null);
    return null;
  }
}

/** Single-flight refresh: parallel callers await the same in-flight request. */
export function refreshSession(): Promise<AuthResultDto | null> {
  refreshPromise ??= performRefresh().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

function buildHeaders(options: RequestOptions, token: string | null): HeadersInit {
  const headers: Record<string, string> = {
    accept: 'application/json',
    'x-locale': options.locale ?? currentLocale,
    ...options.headers,
  };

  // FormData sets its own multipart boundary; overriding it breaks the upload.
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  if (options.body !== undefined && !isFormData) {
    headers['content-type'] = 'application/json';
  }
  if (token) headers.authorization = `Bearer ${token}`;

  return headers;
}

async function execute<T>(
  path: string,
  options: RequestOptions,
  token: string | null,
): Promise<Response> {
  const url = `${API_BASE}/api/v1${path}${buildQueryString(options.query)}`;
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;

  return fetch(url, {
    method: options.method ?? 'GET',
    headers: buildHeaders(options, token),
    credentials: 'include',
    ...(options.body !== undefined
      ? { body: isFormData ? (options.body as FormData) : JSON.stringify(options.body) }
      : {}),
    ...(options.signal ? { signal: options.signal } : {}),
  });
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<ApiResult<T>> {
  // Refresh proactively when the token is about to expire — cheaper than
  // letting the request fail and retrying.
  if (accessTokenIsStale() && !path.startsWith('/auth/')) {
    await refreshSession();
  }

  let response = await execute<T>(path, options, accessToken);

  if (response.status === 401 && !path.startsWith('/auth/refresh')) {
    const session = await refreshSession();
    if (session) {
      response = await execute<T>(path, options, session.accessToken);
    }
  }

  if (response.status === 204) {
    return { data: undefined as T };
  }

  const payload = (await response.json().catch(() => null)) as ApiResponse<T> | null;

  if (!response.ok || !payload || payload.success === false) {
    const errorBody: ApiErrorBody =
      payload && payload.success === false
        ? payload.error
        : { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' };

    if (response.status === 401) emitSessionChange(null);

    throw new ApiError(response.status, errorBody);
  }

  return { data: payload.data, ...(payload.meta ? { meta: payload.meta } : {}) };
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const result = await apiRequest<T>(path, options);
  return result.data;
}

export const api = {
  get: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiFetch<T>(path, { ...options, method: 'GET' }),
  getWithMeta: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiFetch<T>(path, { ...options, method: 'POST', body }),
  put: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiFetch<T>(path, { ...options, method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiFetch<T>(path, { ...options, method: 'PATCH', body }),
  delete: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiFetch<T>(path, { ...options, method: 'DELETE' }),
};

export { ApiError };
