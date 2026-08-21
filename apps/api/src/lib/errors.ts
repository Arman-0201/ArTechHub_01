import type { ApiErrorCode, ApiFieldErrors } from '@academy/types';

/**
 * Every error the API deliberately surfaces derives from `AppError`.
 * Anything else that reaches the error handler is treated as an unexpected
 * failure: logged in full, reported to the client as a bare INTERNAL_ERROR.
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: ApiErrorCode;
  readonly fields: ApiFieldErrors | undefined;
  /** Safe to show to the caller — never contains internal detail. */
  readonly isOperational = true;
  /** Extra context for the log line only; never serialised to the client. */
  readonly context: Record<string, unknown> | undefined;

  constructor(
    message: string,
    statusCode: number,
    code: ApiErrorCode,
    options?: { fields?: ApiFieldErrors; context?: Record<string, unknown> },
  ) {
    super(message);
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = code;
    this.fields = options?.fields;
    this.context = options?.context;
    Error.captureStackTrace?.(this, new.target);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', fields?: ApiFieldErrors) {
    super(message, 422, 'VALIDATION_ERROR', { fields });
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad request') {
    super(message, 400, 'BAD_REQUEST');
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

export class AuthorizationError extends AppError {
  constructor(message = 'You do not have permission to perform this action') {
    super(message, 403, 'AUTHORIZATION_ERROR');
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource already exists', fields?: ApiFieldErrors) {
    super(message, 409, 'CONFLICT', { fields });
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too many requests, please try again later') {
    super(message, 429, 'RATE_LIMITED');
  }
}

export class FeatureDisabledError extends AppError {
  constructor(feature: string) {
    super('This feature is not available', 404, 'FEATURE_DISABLED', { context: { feature } });
  }
}

export class MaintenanceModeError extends AppError {
  constructor(message = 'The platform is temporarily unavailable for maintenance') {
    super(message, 503, 'MAINTENANCE_MODE');
  }
}

export class PayloadTooLargeError extends AppError {
  constructor(message = 'Uploaded file is too large') {
    super(message, 413, 'PAYLOAD_TOO_LARGE');
  }
}

export class UnsupportedMediaTypeError extends AppError {
  constructor(message = 'Unsupported file type') {
    super(message, 415, 'UNSUPPORTED_MEDIA_TYPE');
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
