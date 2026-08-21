import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';

/**
 * Work factor for password hashing.
 *
 * `bcryptjs` is a pure-JavaScript implementation — chosen so the platform
 * installs without a native toolchain — and it is roughly 3–4× slower than
 * native bcrypt at the same cost. Cost 11 lands a single hash near 400ms here,
 * which is the balance point: expensive enough that offline cracking is
 * impractical, cheap enough that the login endpoint is not itself a
 * denial-of-service vector.
 *
 * If native `bcrypt` is available in your deployment, swapping the import and
 * raising this to 12 is a strict improvement.
 */
const BCRYPT_ROUNDS = 11;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

/**
 * Burns roughly the same time as a real verification.
 *
 * Called when an account does not exist so that response timing does not reveal
 * which email addresses are registered.
 */
export async function fakePasswordVerification(): Promise<void> {
  await bcrypt.compare(
    'timing-equalisation',
    '$2a$12$C6UzMDM.H6dfI/f/IKcEe.Ppa/HRlmnAiCXvvsIxbcNGrfKtBmhoy',
  );
}

/** URL-safe random string used for verification, reset and session tokens. */
export function generateOpaqueToken(byteLength = 48): string {
  return crypto.randomBytes(byteLength).toString('base64url');
}

/**
 * Keyed hash of a token. The pepper lives in the environment rather than the
 * database, so a stolen database dump alone cannot be used to look up which
 * stored hash a captured token belongs to.
 */
export function hashToken(token: string): string {
  return crypto.createHmac('sha256', env.TOKEN_PEPPER_SECRET).update(token).digest('hex');
}

/** Six-digit numeric code, uniformly distributed (no modulo bias). */
export function generateOtpCode(): string {
  const code = crypto.randomInt(0, 1_000_000);
  return code.toString().padStart(6, '0');
}

/** Constant-time comparison for secrets compared as strings. */
export function safeCompare(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'utf8');
  const bufferB = Buffer.from(b, 'utf8');
  if (bufferA.length !== bufferB.length) {
    // `timingSafeEqual` throws on length mismatch; compare against self to keep
    // the timing profile flat before returning false.
    crypto.timingSafeEqual(bufferA, bufferA);
    return false;
  }
  return crypto.timingSafeEqual(bufferA, bufferB);
}

export function sha256Hex(value: string | Buffer): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/** Signs a short-lived payload (OAuth `state`) without a database round-trip. */
export function signStatePayload(payload: Record<string, unknown>, ttlSeconds = 600): string {
  const body = { ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const encoded = Buffer.from(JSON.stringify(body), 'utf8').toString('base64url');
  const signature = crypto
    .createHmac('sha256', env.TOKEN_PEPPER_SECRET)
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${signature}`;
}

export function verifyStatePayload<T extends Record<string, unknown>>(state: string): T | null {
  const parts = state.split('.');
  if (parts.length !== 2) return null;
  const [encoded, signature] = parts as [string, string];

  const expected = crypto
    .createHmac('sha256', env.TOKEN_PEPPER_SECRET)
    .update(encoded)
    .digest('base64url');
  if (!safeCompare(signature, expected)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as T & {
      exp?: number;
    };
    if (typeof parsed.exp !== 'number' || parsed.exp * 1000 < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Random, human-friendly order reference such as `ORD-7K4M2XQ9`. */
export function generateReference(prefix = 'ORD'): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  const bytes = crypto.randomBytes(8);
  for (let index = 0; index < 8; index += 1) {
    suffix += alphabet[bytes[index]! % alphabet.length];
  }
  return `${prefix}-${suffix}`;
}
