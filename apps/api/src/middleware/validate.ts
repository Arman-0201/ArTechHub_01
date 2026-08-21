import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError, type ZodTypeAny, type z } from 'zod';
import type { ApiFieldErrors } from '@academy/types';
import { ValidationError } from '../lib/errors.js';

/**
 * Validation runs before any controller logic. Parsed output replaces the raw
 * input on the request, so downstream code works with coerced, trimmed,
 * defaulted values and can never accidentally read an unvalidated field.
 */

export function zodIssuesToFields(error: ZodError): ApiFieldErrors {
  const fields: ApiFieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join('.') : '_root';
    (fields[key] ??= []).push(issue.message);
  }
  return fields;
}

type RequestPart = 'body' | 'query' | 'params';

function validatePart(schema: ZodTypeAny, part: RequestPart): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[part]);
    if (!result.success) {
      next(new ValidationError('Validation failed', zodIssuesToFields(result.error)));
      return;
    }
    // `req.query` is a getter in Express 5 and a plain property in 4; assigning
    // through `Object.defineProperty` keeps both working.
    Object.defineProperty(req, part, {
      value: result.data,
      writable: true,
      enumerable: true,
      configurable: true,
    });
    next();
  };
}

export const validateBody = (schema: ZodTypeAny): RequestHandler => validatePart(schema, 'body');
export const validateQuery = (schema: ZodTypeAny): RequestHandler => validatePart(schema, 'query');
export const validateParams = (schema: ZodTypeAny): RequestHandler => validatePart(schema, 'params');

/** Typed accessors so controllers do not have to cast. */
export function body<T extends ZodTypeAny>(req: Request): z.infer<T> {
  return req.body as z.infer<T>;
}

export function query<T extends ZodTypeAny>(req: Request): z.infer<T> {
  return req.query as unknown as z.infer<T>;
}

export function params<T extends ZodTypeAny>(req: Request): z.infer<T> {
  return req.params as unknown as z.infer<T>;
}

/** Validates a value outside the request pipeline (jobs, imports, seeds). */
export function parseOrThrow<T extends ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ValidationError('Validation failed', zodIssuesToFields(result.error));
  }
  return result.data;
}
