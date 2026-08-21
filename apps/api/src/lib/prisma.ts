import { Prisma, PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';
import { logger } from './logger.js';
import { ConflictError, NotFoundError } from './errors.js';

/**
 * A single client is shared process-wide. In development the module is
 * re-evaluated on every hot reload, so the instance is cached on `globalThis`
 * to avoid exhausting the connection pool.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.isDevelopment
      ? [{ emit: 'event', level: 'warn' }, { emit: 'event', level: 'error' }]
      : [{ emit: 'event', level: 'error' }],
  });

prisma.$on('error' as never, (event: unknown) => {
  logger.error({ prisma: event }, 'Prisma error');
});

if (!env.isProduction) {
  globalForPrisma.prisma = prisma;
}

/**
 * JSON column helpers.
 *
 * Prisma does not accept a plain JavaScript `null` for a `Json` column — it
 * needs `Prisma.DbNull` (store SQL NULL) or `Prisma.JsonNull` (store the JSON
 * value `null`). Passing `null` directly throws at runtime, and because the
 * field types are unions the mistake is easy to hide behind a cast.
 *
 * Every write to a JSON column goes through one of these two functions.
 */

/** For nullable JSON columns: absent values become SQL NULL. */
export function jsonOrDbNull(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return value === null || value === undefined
    ? Prisma.DbNull
    : (value as Prisma.InputJsonValue);
}

/** For non-nullable JSON columns: absent values become the JSON literal `null`. */
export function jsonOrJsonNull(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return value === null || value === undefined
    ? Prisma.JsonNull
    : (value as Prisma.InputJsonValue);
}

export type PrismaTransaction = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

/** Either the shared client or an open interactive transaction. */
export type Db = PrismaClient | PrismaTransaction;

/**
 * Translates the Prisma error codes we deliberately rely on into API errors.
 * Anything not listed here is re-thrown and becomes a 500 — the raw Prisma
 * message (which can contain column names and values) never reaches a client.
 */
export function translatePrismaError(error: unknown, resource = 'Resource'): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case 'P2002': {
        const target = error.meta?.target;
        const fieldNames = Array.isArray(target) ? target.map(String) : [];
        const readable = fieldNames.length > 0 ? fieldNames.join(', ') : 'value';
        throw new ConflictError(
          `A record with this ${readable} already exists`,
          fieldNames.length > 0
            ? Object.fromEntries(fieldNames.map((field) => [field, ['Already in use']]))
            : undefined,
        );
      }
      case 'P2025':
        throw new NotFoundError(resource);
      case 'P2003':
        throw new ConflictError('This record is referenced by other data and cannot be changed');
      default:
        break;
    }
  }
  throw error;
}

export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}
