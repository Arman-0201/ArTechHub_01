import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { env } from '../config/env.js';
import { logger } from './logger.js';

/**
 * Storage abstraction.
 *
 * Two drivers behind one interface: `local` for development, `s3` for anything
 * S3-compatible (AWS, Supabase Storage, R2, MinIO). Callers only ever see a
 * `storageKey` and a public URL — nothing above this module knows which driver
 * is active, so swapping providers is a configuration change.
 *
 * Security invariants enforced here rather than at the call site:
 *   - keys are generated server-side from random bytes; the uploaded filename
 *     is never used to build a path;
 *   - the key is validated against a strict pattern before any filesystem or
 *     network operation, so `../` can never escape the upload root.
 */

export interface StoredObject {
  storageKey: string;
  url: string;
  driver: 'local' | 's3';
  sizeBytes: number;
  checksum: string;
}

const SAFE_KEY_PATTERN = /^[a-z0-9][a-z0-9/_-]{0,200}\.[a-z0-9]{1,12}$/;

function assertSafeKey(key: string): void {
  if (!SAFE_KEY_PATTERN.test(key) || key.includes('..')) {
    throw new Error(`Refusing to operate on unsafe storage key: ${key}`);
  }
}

/** Maps a MIME type to a safe extension. The client's extension is discarded. */
const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
  'application/pdf': 'pdf',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'text/plain': 'txt',
  'text/csv': 'csv',
  'application/zip': 'zip',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
};

export function extensionForMime(mimeType: string): string {
  return EXTENSION_BY_MIME[mimeType] ?? 'bin';
}

export function buildStorageKey(mimeType: string, folder?: string | null): string {
  const now = new Date();
  const datePart = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const random = crypto.randomBytes(16).toString('hex');
  const extension = extensionForMime(mimeType);

  const normalisedFolder = (folder ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9/_-]/g, '')
    .replace(/^\/+|\/+$/g, '')
    .slice(0, 60);

  const prefix = normalisedFolder ? `${normalisedFolder}/${datePart}` : datePart;
  return `${prefix}/${random}.${extension}`;
}

let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (s3Client) return s3Client;
  s3Client = new S3Client({
    region: env.S3_REGION,
    ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT } : {}),
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    credentials:
      env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
        ? { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY }
        : undefined,
  });
  return s3Client;
}

export function publicUrlForKey(key: string, driver: string = env.STORAGE_DRIVER): string {
  const base =
    driver === 's3'
      ? (env.S3_PUBLIC_URL ?? `${env.S3_ENDPOINT ?? ''}/${env.S3_BUCKET ?? ''}`)
      : env.STORAGE_PUBLIC_URL;
  return `${base.replace(/\/+$/, '')}/${key}`;
}

export async function putObject(
  buffer: Buffer,
  mimeType: string,
  options: { folder?: string | null; key?: string } = {},
): Promise<StoredObject> {
  const storageKey = options.key ?? buildStorageKey(mimeType, options.folder);
  assertSafeKey(storageKey);

  const checksum = crypto.createHash('sha256').update(buffer).digest('hex');

  if (env.STORAGE_DRIVER === 's3') {
    if (!env.S3_BUCKET) throw new Error('S3_BUCKET is not configured');
    await getS3Client().send(
      new PutObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: storageKey,
        Body: buffer,
        ContentType: mimeType,
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
  } else {
    const destination = path.join(env.uploadsDir, storageKey);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, buffer);
  }

  return {
    storageKey,
    url: publicUrlForKey(storageKey),
    driver: env.STORAGE_DRIVER,
    sizeBytes: buffer.byteLength,
    checksum,
  };
}

export async function deleteObject(storageKey: string, driver: string): Promise<void> {
  assertSafeKey(storageKey);

  try {
    if (driver === 's3') {
      if (!env.S3_BUCKET) return;
      await getS3Client().send(
        new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: storageKey }),
      );
      return;
    }
    await fs.unlink(path.join(env.uploadsDir, storageKey));
  } catch (error) {
    // A missing object is not an error worth failing the request for — the
    // database row is what the admin asked to remove.
    logger.warn({ storageKey, driver, err: error }, 'Failed to delete stored object');
  }
}

export async function readObject(storageKey: string, driver: string): Promise<Buffer> {
  assertSafeKey(storageKey);

  if (driver === 's3') {
    if (!env.S3_BUCKET) throw new Error('S3_BUCKET is not configured');
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    const response = await getS3Client().send(
      new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: storageKey }),
    );
    const chunks: Buffer[] = [];
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  return fs.readFile(path.join(env.uploadsDir, storageKey));
}

export async function ensureLocalStorageReady(): Promise<void> {
  if (env.STORAGE_DRIVER !== 'local') return;
  await fs.mkdir(env.uploadsDir, { recursive: true });
}
