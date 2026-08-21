import crypto from 'node:crypto';
import type { RequestHandler } from 'express';
import { DEFAULT_LOCALE, LOCALE_CODES } from '@academy/types';

/**
 * Assigns a correlation id to every request. It is echoed in error responses
 * and attached to every log line, so a user-reported failure can be traced to
 * exactly one server-side log entry.
 */
export const requestContext: RequestHandler = (req, res, next) => {
  const incoming = req.get('x-request-id');
  // An inbound id is trusted only if it looks like one — otherwise a caller
  // could inject newlines into log output.
  const requestId =
    incoming && /^[A-Za-z0-9._-]{8,64}$/.test(incoming) ? incoming : crypto.randomUUID();

  req.requestId = requestId;
  res.setHeader('x-request-id', requestId);
  next();
};

function parseAcceptLanguage(header: string | undefined): string[] {
  if (!header) return [];
  return header
    .split(',')
    .map((part) => {
      const [tag, ...rest] = part.trim().split(';');
      const qualityPart = rest.find((entry) => entry.trim().startsWith('q='));
      const quality = qualityPart ? Number.parseFloat(qualityPart.split('=')[1] ?? '1') : 1;
      return { tag: (tag ?? '').trim(), quality: Number.isFinite(quality) ? quality : 0 };
    })
    .filter((entry) => entry.tag.length > 0)
    .sort((a, b) => b.quality - a.quality)
    .map((entry) => entry.tag);
}

/**
 * Resolves the response locale, in priority order:
 *   1. explicit `?locale=` (used by the web app's server-side fetches)
 *   2. `x-locale` header
 *   3. the signed-in user's saved preference
 *   4. `Accept-Language`, including base-language matches (`en-AU` -> `en`)
 *   5. the platform default
 */
export const resolveLocale: RequestHandler = (req, _res, next) => {
  const candidates: string[] = [];

  const queryLocale = req.query?.locale;
  if (typeof queryLocale === 'string') candidates.push(queryLocale);

  const headerLocale = req.get('x-locale');
  if (headerLocale) candidates.push(headerLocale);

  if (req.user?.locale) candidates.push(req.user.locale);

  candidates.push(...parseAcceptLanguage(req.get('accept-language')));

  for (const candidate of candidates) {
    if (LOCALE_CODES.includes(candidate)) {
      req.locale = candidate;
      next();
      return;
    }
    const base = candidate.split('-')[0];
    if (base && LOCALE_CODES.includes(base)) {
      req.locale = base;
      next();
      return;
    }
  }

  req.locale = DEFAULT_LOCALE;
  next();
};
