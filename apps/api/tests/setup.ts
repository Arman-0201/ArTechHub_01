import { beforeAll } from 'vitest';

/**
 * Test environment.
 *
 * Secrets are set here rather than read from a `.env` so the suite is
 * self-contained and cannot accidentally run against real credentials.
 * `DATABASE_URL` is deliberately NOT set: tests that need a database read it
 * from the real environment and skip themselves when it is absent.
 */
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-that-is-long-enough-for-validation';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-that-is-long-enough-for-validation';
process.env.TOKEN_PEPPER_SECRET ??= 'test-pepper-secret-that-is-long-enough-for-validation';
process.env.DATABASE_URL ??= 'postgresql://postgres:postgres@localhost:5432/academy_test?schema=public';
process.env.MAIL_TRANSPORT ??= 'console';
process.env.STORAGE_DRIVER ??= 'local';
process.env.LOG_LEVEL ??= 'silent';
/**
 * Two hops, matching the documented deployment, so the realtime hub's
 * hand-rolled hop counting is exercised rather than skipped. Nothing else in
 * the suite sends `X-Forwarded-For`, so `req.ip` is unaffected.
 */
process.env.TRUST_PROXY ??= '2';

/** True when a real database is reachable for integration tests. */
export const hasDatabase = Boolean(process.env.TEST_DATABASE_URL);

if (hasDatabase) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;
}

beforeAll(() => {
  if (!hasDatabase) {
    // Printed once so a green run is not mistaken for full coverage.
    console.info(
      '\n  ℹ Integration tests are skipped: set TEST_DATABASE_URL to a disposable database to run them.\n',
    );
  }
});
