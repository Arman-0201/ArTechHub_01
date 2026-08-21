import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globals: false,
    testTimeout: 20000,
    hookTimeout: 30000,
    // API integration tests share one PostgreSQL schema, so they must not run
    // in parallel against the same database.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
});
