/**
 * Transport-level API contract shared by the Express API and the Next.js app.
 * These shapes are the ONLY thing the two apps agree on — the web app never
 * imports backend internals (services, Prisma models, repositories).
 */

export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'AUTHENTICATION_ERROR'
  | 'AUTHORIZATION_ERROR'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'FEATURE_DISABLED'
  | 'MAINTENANCE_MODE'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'BAD_REQUEST'
  | 'INTERNAL_ERROR';

/** Field-level validation problems, keyed by dotted path (`profile.name`). */
export type ApiFieldErrors = Record<string, string[]>;

export interface ApiErrorBody {
  code: ApiErrorCode;
  message: string;
  /** Present only for VALIDATION_ERROR. */
  fields?: ApiFieldErrors;
  /** Correlates a client-visible failure with a server log line. */
  requestId?: string;
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: PaginationMeta;
}

export interface ApiFailure {
  success: false;
  error: ApiErrorBody;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  /** Opaque cursor for cursor-paginated endpoints. */
  nextCursor?: string | null;
}

export interface PaginatedResult<T> {
  items: T[];
  meta: PaginationMeta;
}

export interface ListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  sort?: string;
  order?: 'asc' | 'desc';
}
