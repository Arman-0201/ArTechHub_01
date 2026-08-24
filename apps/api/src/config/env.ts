import { fileURLToPath } from 'node:url';
import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
// src/config -> src -> apps/api -> apps -> repo root
const repoRoot = path.resolve(currentDir, '../../../..');
const apiRoot = path.resolve(currentDir, '../..');

// Local `.env` inside apps/api wins over the shared root `.env`; neither
// overrides variables already present in the real process environment, so a
// container or CI runner always has the final say.
dotenv.config({ path: path.join(apiRoot, '.env') });
dotenv.config({ path: path.join(repoRoot, '.env') });

const booleanish = z
  .union([z.boolean(), z.string()])
  .transform((value) =>
    typeof value === 'boolean' ? value : ['1', 'true', 'yes', 'on'].includes(value.toLowerCase()),
  );

const csvList = z
  .string()
  .default('')
  .transform((value) =>
    value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean),
  );

/**
 * Secrets must be long enough that a brute-force against a signed token is not
 * the weakest link, and must not be left at their placeholder value in
 * production — `assertProductionSecrets` below enforces the second part.
 */
const secretSchema = z.string().min(32, 'Secret must be at least 32 characters');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  API_PUBLIC_URL: z.string().url().default('http://localhost:4000'),
  WEB_PUBLIC_URL: z.string().url().default('http://localhost:3000'),
  CORS_ORIGINS: csvList,
  TRUST_PROXY: booleanish.default(false),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DIRECT_URL: z.string().optional(),

  JWT_ACCESS_SECRET: secretSchema,
  JWT_REFRESH_SECRET: secretSchema,
  TOKEN_PEPPER_SECRET: secretSchema,
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  COOKIE_DOMAIN: z.string().optional(),
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  COOKIE_SECURE: booleanish.default(false),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),

  MAIL_TRANSPORT: z.enum(['console', 'smtp']).default('console'),
  MAIL_FROM: z.string().default('Academy <no-reply@academy.local>'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().optional(),
  SMTP_SECURE: booleanish.default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),

  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default('uploads'),
  STORAGE_PUBLIC_URL: z.string().default('http://localhost:4000/uploads'),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('auto'),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: booleanish.default(true),
  S3_PUBLIC_URL: z.string().optional(),
  MAX_UPLOAD_MB: z.coerce.number().int().min(1).max(500).default(25),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().min(10).default(300),

  SEED_ADMIN_EMAIL: z.string().email().default('admin@academy.local'),
  SEED_ADMIN_PASSWORD: z.string().min(10).default('Admin123!Change'),
  SEED_ADMIN_NAME: z.string().default('Platform Owner'),

  // `silent` is a real pino level and the one the test suite uses.
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),
});

export type AppEnv = z.infer<typeof envSchema> & {
  isProduction: boolean;
  isDevelopment: boolean;
  isTest: boolean;
  corsOrigins: string[];
  apiRoot: string;
  repoRoot: string;
  uploadsDir: string;
  maxUploadBytes: number;
  oauth: {
    google: { enabled: boolean; clientId?: string; clientSecret?: string };
    github: { enabled: boolean; clientId?: string; clientSecret?: string };
  };
};

const PLACEHOLDER_MARKERS = ['change-me', 'changeme', 'your-secret', 'replace-me'];

function assertProductionSecrets(parsed: z.infer<typeof envSchema>): void {
  if (parsed.NODE_ENV !== 'production') return;

  const problems: string[] = [];
  const secrets: [string, string][] = [
    ['JWT_ACCESS_SECRET', parsed.JWT_ACCESS_SECRET],
    ['JWT_REFRESH_SECRET', parsed.JWT_REFRESH_SECRET],
    ['TOKEN_PEPPER_SECRET', parsed.TOKEN_PEPPER_SECRET],
  ];

  for (const [name, value] of secrets) {
    if (PLACEHOLDER_MARKERS.some((marker) => value.toLowerCase().includes(marker))) {
      problems.push(`${name} still holds a placeholder value`);
    }
  }

  if (parsed.JWT_ACCESS_SECRET === parsed.JWT_REFRESH_SECRET) {
    problems.push('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must differ');
  }
  if (!parsed.COOKIE_SECURE) {
    problems.push('COOKIE_SECURE must be enabled in production');
  }
  if (parsed.COOKIE_SAMESITE === 'none' && !parsed.COOKIE_SECURE) {
    problems.push('COOKIE_SAMESITE=none requires COOKIE_SECURE=true');
  }
  if (parsed.CORS_ORIGINS.length === 0) {
    problems.push('CORS_ORIGINS must list at least one allowed origin in production');
  }
  if (parsed.STORAGE_DRIVER === 's3' && (!parsed.S3_BUCKET || !parsed.S3_ACCESS_KEY_ID)) {
    problems.push('STORAGE_DRIVER=s3 requires S3_BUCKET and S3 credentials');
  }
  if (parsed.MAIL_TRANSPORT === 'console') {
    problems.push('MAIL_TRANSPORT=console cannot be used in production');
  }
  // `sendMail` deliberately swallows delivery failures so a bad SMTP hop cannot
  // turn a successful registration into a 500. That makes a missing host silent:
  // verification and reset emails would vanish into the log with no signal. Catch
  // it at boot instead, where it is still cheap to fix.
  if (parsed.MAIL_TRANSPORT === 'smtp' && !parsed.SMTP_HOST) {
    problems.push('MAIL_TRANSPORT=smtp requires SMTP_HOST');
  }

  if (problems.length > 0) {
    throw new Error(`Unsafe production configuration:\n  - ${problems.join('\n  - ')}`);
  }
}

function loadEnv(): AppEnv {
  // Platforms-as-a-service (Render, Fly, Heroku, Cloud Run) inject the port to
  // bind as `PORT` and route external traffic to it. Honouring it here means a
  // provider changing that port can never leave the process listening on the
  // wrong one; an explicit `API_PORT` still wins for local and container runs.
  const result = envSchema.safeParse({
    ...process.env,
    API_PORT: process.env.API_PORT ?? process.env.PORT,
  });

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    // Fail loudly and immediately: a half-configured server is worse than one
    // that refuses to boot.
    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  assertProductionSecrets(result.data);

  const parsed = result.data;
  const corsOrigins =
    parsed.CORS_ORIGINS.length > 0 ? parsed.CORS_ORIGINS : [parsed.WEB_PUBLIC_URL];

  return {
    ...parsed,
    isProduction: parsed.NODE_ENV === 'production',
    isDevelopment: parsed.NODE_ENV === 'development',
    isTest: parsed.NODE_ENV === 'test',
    corsOrigins,
    apiRoot,
    repoRoot,
    uploadsDir: path.isAbsolute(parsed.STORAGE_LOCAL_DIR)
      ? parsed.STORAGE_LOCAL_DIR
      : path.join(apiRoot, parsed.STORAGE_LOCAL_DIR),
    maxUploadBytes: parsed.MAX_UPLOAD_MB * 1024 * 1024,
    oauth: {
      google: {
        enabled: Boolean(parsed.GOOGLE_CLIENT_ID && parsed.GOOGLE_CLIENT_SECRET),
        clientId: parsed.GOOGLE_CLIENT_ID,
        clientSecret: parsed.GOOGLE_CLIENT_SECRET,
      },
      github: {
        enabled: Boolean(parsed.GITHUB_CLIENT_ID && parsed.GITHUB_CLIENT_SECRET),
        clientId: parsed.GITHUB_CLIENT_ID,
        clientSecret: parsed.GITHUB_CLIENT_SECRET,
      },
    },
  };
}

export const env: AppEnv = loadEnv();
