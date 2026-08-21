import type { Request, RequestHandler, Response } from 'express';
import type { ApiSuccess, PaginatedResult, PaginationMeta } from '@academy/types';

/** Wraps a value in the standard success envelope. */
export function ok<T>(res: Response, data: T, statusCode = 200, meta?: PaginationMeta): Response {
  const body: ApiSuccess<T> = meta ? { success: true, data, meta } : { success: true, data };
  return res.status(statusCode).json(body);
}

export function created<T>(res: Response, data: T): Response {
  return ok(res, data, 201);
}

export function noContent(res: Response): Response {
  return res.status(204).send();
}

export function paginated<T>(res: Response, result: PaginatedResult<T>): Response {
  return ok(res, result.items, 200, result.meta);
}

export function buildPaginationMeta(
  total: number,
  page: number,
  pageSize: number,
): PaginationMeta {
  const totalPages = pageSize > 0 ? Math.max(1, Math.ceil(total / pageSize)) : 1;
  return {
    page,
    pageSize,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  };
}

export function toSkipTake(page: number, pageSize: number): { skip: number; take: number } {
  return { skip: (page - 1) * pageSize, take: pageSize };
}

/**
 * Express 4 does not forward rejected promises to the error middleware, so every
 * async handler is wrapped. Without this a thrown `AppError` inside an async
 * controller would hang the request instead of producing a JSON error.
 */
export function asyncHandler<T extends RequestHandler>(handler: T): RequestHandler {
  return (req, res, next) => {
    void Promise.resolve(handler(req, res, next)).catch(next);
  };
}

/** Client IP, honouring the proxy chain only when the app is configured to trust it. */
export function getClientIp(req: Request): string | undefined {
  return req.ip ?? req.socket.remoteAddress ?? undefined;
}

export function getUserAgent(req: Request): string | undefined {
  const value = req.get('user-agent');
  return value ? value.slice(0, 500) : undefined;
}
