import pino, { type LoggerOptions } from 'pino';
import { env } from '../config/env.js';

/**
 * Redaction list.
 *
 * Structured logging makes it easy to accidentally serialise a whole request
 * body. These paths are stripped before anything is written, so a stray
 * `logger.info({ body })` can never leak a password or a bearer token.
 */
const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'res.headers["set-cookie"]',
  'password',
  'newPassword',
  'currentPassword',
  'confirmPassword',
  'passwordHash',
  'token',
  'accessToken',
  'refreshToken',
  'tokenHash',
  'code',
  'clientSecret',
  '*.password',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  'body.password',
  'body.newPassword',
  'body.currentPassword',
  'body.token',
];

const options: LoggerOptions = {
  level: env.LOG_LEVEL ?? (env.isProduction ? 'info' : env.isTest ? 'silent' : 'debug'),
  redact: { paths: REDACTED_PATHS, censor: '[redacted]' },
  base: { service: 'academy-api', env: env.NODE_ENV },
  timestamp: pino.stdTimeFunctions.isoTime,
};

export const logger = env.isProduction
  ? pino(options)
  : pino({
      ...options,
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname,service,env' },
      },
    });

/**
 * Dedicated channel for security-relevant events (failed logins, token reuse,
 * permission denials). Kept separate so it can be routed to its own sink.
 */
export const securityLogger = logger.child({ channel: 'security' });

export type SecurityEvent =
  | 'auth.login.success'
  | 'auth.login.failed'
  | 'auth.login.locked'
  | 'auth.register'
  | 'auth.logout'
  | 'auth.refresh.reuse_detected'
  | 'auth.password.reset_requested'
  | 'auth.password.reset_completed'
  | 'auth.password.changed'
  | 'auth.email.verified'
  | 'auth.otp.failed'
  | 'auth.oauth.linked'
  | 'authz.denied'
  | 'upload.rejected'
  | 'ratelimit.tripped';

export function logSecurityEvent(
  event: SecurityEvent,
  data: Record<string, unknown> = {},
): void {
  securityLogger.info({ event, ...data }, event);
}
