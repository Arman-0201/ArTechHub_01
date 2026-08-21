import type { ApiErrorBody, ApiFieldErrors, PaginationMeta } from '@academy/types';

/**
 * A failed API call, carrying the server's structured error so forms can map
 * field errors back onto inputs instead of showing one generic message.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorBody['code'];
  readonly fields: ApiFieldErrors | undefined;
  readonly requestId: string | undefined;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.code;
    this.fields = body.fields;
    this.requestId = body.requestId;
  }

  /** True when the caller should sign in again rather than retry. */
  get isAuthError(): boolean {
    return this.status === 401;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  get isForbidden(): boolean {
    return this.status === 403;
  }
}

export interface ApiResult<T> {
  data: T;
  meta?: PaginationMeta;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Appended as a query string; undefined and null values are dropped. */
  query?: Record<string, string | number | boolean | undefined | null>;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  locale?: string;
  /** Next.js fetch cache controls — server-side calls only. */
  cache?: RequestCache;
  revalidate?: number | false;
  tags?: string[];
}

export function buildQueryString(
  query: RequestOptions['query'],
): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }
  const serialised = params.toString();
  return serialised ? `?${serialised}` : '';
}
