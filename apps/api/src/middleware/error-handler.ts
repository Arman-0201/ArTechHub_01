import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import multer from 'multer';
import type { ApiFailure } from '@academy/types';
import { AppError, NotFoundError, PayloadTooLargeError, isAppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { zodIssuesToFields } from './validate.js';
import { env } from '../config/env.js';

/** Terminal 404 for any route that no router claimed. */
export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new NotFoundError(`Route ${req.method} ${req.path}`));
};

/**
 * Normalises every failure into the single API error envelope.
 *
 * The rule that matters: a client only ever sees a code, a safe message and
 * (for validation) field errors. Stack traces, Prisma messages and internal
 * context go to the log, keyed by the request id the client is given so support
 * can still correlate a report with a log line.
 */
export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  const requestId = req.requestId ?? 'unknown';

  let appError: AppError;

  if (isAppError(error)) {
    appError = error;
  } else if (error instanceof ZodError) {
    appError = new AppError('Validation failed', 422, 'VALIDATION_ERROR', {
      fields: zodIssuesToFields(error),
    });
  } else if (error instanceof multer.MulterError) {
    appError =
      error.code === 'LIMIT_FILE_SIZE'
        ? new PayloadTooLargeError(`File exceeds the ${env.MAX_UPLOAD_MB}MB limit`)
        : new AppError('File upload failed', 400, 'BAD_REQUEST');
  } else if (error instanceof Prisma.PrismaClientKnownRequestError) {
    // Reaching here means a service did not translate the code explicitly.
    appError = new AppError('The request could not be completed', 409, 'CONFLICT');
  } else if (error instanceof SyntaxError && 'body' in error) {
    appError = new AppError('Malformed JSON body', 400, 'BAD_REQUEST');
  } else {
    appError = new AppError('An unexpected error occurred', 500, 'INTERNAL_ERROR');
  }

  const logPayload = {
    requestId,
    method: req.method,
    path: req.originalUrl,
    statusCode: appError.statusCode,
    code: appError.code,
    userId: req.user?.id,
    ...(appError.context ?? {}),
  };

  if (appError.statusCode >= 500) {
    logger.error({ ...logPayload, err: error }, appError.message);
  } else if (appError.statusCode === 429 || appError.statusCode === 403) {
    logger.warn(logPayload, appError.message);
  } else {
    logger.debug(logPayload, appError.message);
  }

  const body: ApiFailure = {
    success: false,
    error: {
      code: appError.code,
      message: appError.message,
      ...(appError.fields ? { fields: appError.fields } : {}),
      requestId,
    },
  };

  // Development convenience only: never enabled in production.
  if (!env.isProduction && appError.statusCode >= 500 && error instanceof Error) {
    (body.error as unknown as Record<string, unknown>).debug = {
      name: error.name,
      message: error.message,
      stack: error.stack?.split('\n').slice(0, 8),
    };
  }

  res.status(appError.statusCode).json(body);
};
