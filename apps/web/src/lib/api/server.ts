import 'server-only';
import { cookies, headers } from 'next/headers';
import type { ApiErrorBody, ApiResponse } from '@academy/types';
import { ApiError, buildQueryString, type ApiResult, type RequestOptions } from './types';

/**
 * Server-side API client, used by Server Components and route handlers.
 *
 * Two things distinguish it from the browser client:
 *
 *   1. It talks to `API_INTERNAL_URL`, which in a container deployment is the
 *      service name rather than the public hostname — no traffic leaves the
 *      network for a server render.
 *   2. It forwards the incoming request's cookies, so a server-rendered page
 *      sees the same session the browser does. It never handles access tokens
 *      directly: the refresh cookie is HttpOnly and the API resolves it.
 */

const API_BASE = (
  process.env.API_INTERNAL_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:4000'
).replace(/\/+$/, '');

async function buildHeaders(options: RequestOptions): Promise<HeadersInit> {
  const cookieStore = await cookies();
  const requestHeaders = await headers();

  const result: Record<string, string> = {
    accept: 'application/json',
    ...options.headers,
  };

  if (options.body !== undefined) {
    result['content-type'] = 'application/json';
  }
  if (options.locale) {
    result['x-locale'] = options.locale;
  }

  const cookieHeader = cookieStore
    .getAll()
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join('; ');
  if (cookieHeader) result.cookie = cookieHeader;

  // Preserve the correlation id across the server-render hop so one browser
  // request produces one traceable chain in the API logs.
  const requestId = requestHeaders.get('x-request-id');
  if (requestId) result['x-request-id'] = requestId;

  return result;
}

export async function serverRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<ApiResult<T>> {
  const url = `${API_BASE}/api/v1${path}${buildQueryString(options.query)}`;

  const init: RequestInit & { next?: { revalidate?: number | false; tags?: string[] } } = {
    method: options.method ?? 'GET',
    headers: await buildHeaders(options),
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
  };

  // Anything personalised must not be cached; `cookies()` already opts the
  // route out of static rendering, but being explicit avoids surprises.
  if (options.cache) {
    init.cache = options.cache;
  } else if (options.revalidate !== undefined || options.tags) {
    init.next = {
      ...(options.revalidate !== undefined ? { revalidate: options.revalidate } : {}),
      ...(options.tags ? { tags: options.tags } : {}),
    };
  } else {
    init.cache = 'no-store';
  }

  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    // A network failure reaching our own API is an infrastructure problem, not
    // a user error; surface it as a 503 rather than a confusing crash.
    throw new ApiError(503, {
      code: 'INTERNAL_ERROR',
      message: 'The service is temporarily unreachable.',
      requestId: undefined,
    });
  }

  if (response.status === 204) {
    return { data: undefined as T };
  }

  const payload = (await response.json().catch(() => null)) as ApiResponse<T> | null;

  if (!response.ok || !payload || payload.success === false) {
    const errorBody: ApiErrorBody = payload && payload.success === false
      ? payload.error
      : { code: 'INTERNAL_ERROR', message: 'Something went wrong.' };
    throw new ApiError(response.status, errorBody);
  }

  return { data: payload.data, ...(payload.meta ? { meta: payload.meta } : {}) };
}

/** Convenience wrapper for the common case of only needing the payload. */
export async function serverFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const result = await serverRequest<T>(path, options);
  return result.data;
}

/**
 * Fetches a resource that may legitimately not exist, returning null instead of
 * throwing — used where the page renders a "not found" state itself.
 */
export async function serverFetchOptional<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T | null> {
  try {
    return await serverFetch<T>(path, options);
  } catch (error) {
    if (error instanceof ApiError && (error.isNotFound || error.code === 'FEATURE_DISABLED')) {
      return null;
    }
    throw error;
  }
}
