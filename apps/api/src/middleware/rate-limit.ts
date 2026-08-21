import rateLimit, { type Options } from 'express-rate-limit';
import type { Request } from 'express';
import { env } from '../config/env.js';
import { RateLimitError } from '../lib/errors.js';
import { logSecurityEvent } from '../lib/logger.js';

/**
 * Rate limiting is in-memory, which is correct for a single instance and for
 * development. A multi-instance deployment must swap in a shared store
 * (Redis) — see docs/security.md; the limiter definitions below stay the same.
 */

function build(options: Partial<Options> & { name: string }) {
  const { name, ...rest } = options;
  return rateLimit({
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    // Auth limiters must not be defeated by an attacker rotating their session,
    // so the default key (IP) is what matters there.
    handler: (req, _res, next) => {
      logSecurityEvent('ratelimit.tripped', {
        limiter: name,
        ip: req.ip,
        path: req.originalUrl,
      });
      next(new RateLimitError());
    },
    ...rest,
  });
}

/** Broad ceiling applied to the whole API to blunt scraping and floods. */
export const globalLimiter = build({
  name: 'global',
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.RATE_LIMIT_MAX,
  skip: (req: Request) => req.method === 'OPTIONS' || req.path === '/health',
});

/**
 * Login. Keyed on IP *and* the submitted email so one attacker cannot lock out
 * a victim's account from many IPs, and one IP cannot spray many accounts.
 */
export const loginLimiter = build({
  name: 'auth.login',
  windowMs: 15 * 60 * 1000,
  limit: 10,
  keyGenerator: (req: Request) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase() : 'anonymous';
    return `${req.ip}:${email}`;
  },
  skipSuccessfulRequests: true,
});

export const registerLimiter = build({
  name: 'auth.register',
  windowMs: 60 * 60 * 1000,
  limit: 5,
});

export const passwordResetLimiter = build({
  name: 'auth.password-reset',
  windowMs: 60 * 60 * 1000,
  limit: 5,
});

export const otpLimiter = build({
  name: 'auth.otp',
  windowMs: 15 * 60 * 1000,
  limit: 8,
});

export const emailVerificationLimiter = build({
  name: 'auth.verify',
  windowMs: 60 * 60 * 1000,
  limit: 10,
});

/** Refresh is called often by legitimate clients, so the ceiling is generous. */
export const refreshLimiter = build({
  name: 'auth.refresh',
  windowMs: 15 * 60 * 1000,
  limit: 60,
});

export const uploadLimiter = build({
  name: 'media.upload',
  windowMs: 60 * 60 * 1000,
  limit: 100,
});

/** Public write endpoints reachable without an account. */
export const publicFormLimiter = build({
  name: 'public.form',
  windowMs: 60 * 60 * 1000,
  limit: 10,
});

export const searchLimiter = build({
  name: 'public.search',
  windowMs: 60 * 1000,
  limit: 60,
});
