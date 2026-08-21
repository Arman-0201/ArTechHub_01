import { fileTypeFromBuffer } from 'file-type';
import { imageSize } from 'image-size';
import type { Prisma } from '@prisma/client';
import type { MediaDto, MediaKind, PaginatedResult } from '@academy/types';
import { prisma } from '../../lib/prisma.js';
import { env } from '../../config/env.js';
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  PayloadTooLargeError,
  UnsupportedMediaTypeError,
} from '../../lib/errors.js';
import { buildPaginationMeta, toSkipTake } from '../../lib/http.js';
import { logSecurityEvent } from '../../lib/logger.js';
import { deleteObject, putObject } from '../../lib/storage.js';
import { mediaKindForMime, toMediaDto } from './media.helpers.js';

/**
 * Upload validation.
 *
 * The declared `Content-Type` is treated as a hint and nothing more — it is
 * fully attacker-controlled. The real type is derived from the file's magic
 * bytes, and only then checked against this allowlist.
 *
 * SVG is excluded on purpose: it is an XML document that can carry script, and
 * serving one from the same origin as the app would be a stored-XSS vector.
 */
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
  'application/pdf',
  'video/mp4',
  'video/webm',
  'audio/mpeg',
  'audio/wav',
  'application/zip',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

/** Types whose magic bytes `file-type` cannot detect, verified structurally. */
const TEXT_MIME_TYPES = new Set(['text/plain', 'text/csv']);

export interface UploadInput {
  buffer: Buffer;
  originalName: string;
  declaredMimeType: string;
  folder?: string | null;
  altText?: string | null;
  uploadedById: string;
  /**
   * Restricts the upload to specific media kinds, checked against the *detected*
   * type. Callers with a narrower remit than the media library — the learner
   * avatar endpoint, for instance — use this so a renamed PDF cannot be stored
   * as a profile picture.
   */
  allowedKinds?: MediaKind[];
}

async function detectMimeType(buffer: Buffer, declared: string): Promise<string> {
  const detected = await fileTypeFromBuffer(buffer);

  if (detected) return detected.mime;

  // Plain-text formats have no signature. Accept them only if the bytes really
  // decode as UTF-8 text with no NUL bytes, which rules out a renamed binary.
  if (TEXT_MIME_TYPES.has(declared)) {
    const sample = buffer.subarray(0, 4096);
    if (!sample.includes(0)) return declared;
  }

  throw new UnsupportedMediaTypeError('The file type could not be verified');
}

function readImageDimensions(buffer: Buffer): { width: number | null; height: number | null } {
  try {
    const dimensions = imageSize(buffer);
    return { width: dimensions.width ?? null, height: dimensions.height ?? null };
  } catch {
    // Dimension extraction is a nicety; a failure must not reject the upload.
    return { width: null, height: null };
  }
}

export async function uploadMedia(input: UploadInput): Promise<MediaDto> {
  if (input.buffer.byteLength === 0) {
    throw new BadRequestError('The uploaded file is empty');
  }
  if (input.buffer.byteLength > env.maxUploadBytes) {
    throw new PayloadTooLargeError(`Files must be ${env.MAX_UPLOAD_MB}MB or smaller`);
  }

  const mimeType = await detectMimeType(input.buffer, input.declaredMimeType);

  if (!ALLOWED_MIME_TYPES.has(mimeType) && !TEXT_MIME_TYPES.has(mimeType)) {
    logSecurityEvent('upload.rejected', {
      userId: input.uploadedById,
      declared: input.declaredMimeType,
      detected: mimeType,
    });
    throw new UnsupportedMediaTypeError(`Files of type ${mimeType} are not allowed`);
  }

  if (mimeType !== input.declaredMimeType) {
    // Not fatal — browsers get this wrong routinely — but worth recording,
    // because a deliberate mismatch is a probe.
    logSecurityEvent('upload.rejected', {
      userId: input.uploadedById,
      declared: input.declaredMimeType,
      detected: mimeType,
      action: 'accepted_with_detected_type',
    });
  }

  const kind = mediaKindForMime(mimeType);

  if (input.allowedKinds && !input.allowedKinds.includes(kind)) {
    logSecurityEvent('upload.rejected', {
      userId: input.uploadedById,
      declared: input.declaredMimeType,
      detected: mimeType,
      reason: 'kind_not_allowed',
    });
    throw new UnsupportedMediaTypeError(
      `Only ${input.allowedKinds.join(', ').toLowerCase()} files are allowed here`,
    );
  }

  const dimensions = kind === 'IMAGE' ? readImageDimensions(input.buffer) : { width: null, height: null };

  // Nothing is written to storage until the type has been verified and accepted.
  const stored = await putObject(input.buffer, mimeType, { folder: input.folder });

  const media = await prisma.media.create({
    data: {
      kind,
      // The stored name is derived from the generated key, never from the
      // client's filename.
      fileName: stored.storageKey.split('/').pop() ?? stored.storageKey,
      originalName: input.originalName.slice(0, 255),
      mimeType,
      sizeBytes: stored.sizeBytes,
      storageKey: stored.storageKey,
      storageDriver: stored.driver,
      url: stored.url,
      checksum: stored.checksum,
      width: dimensions.width,
      height: dimensions.height,
      altText: input.altText ?? null,
      folder: input.folder ?? null,
      uploadedById: input.uploadedById,
    },
    include: { uploadedBy: { select: { id: true, name: true } } },
  });

  return toMediaDto(media);
}

export interface ListMediaInput {
  page: number;
  pageSize: number;
  search?: string;
  kind?: string;
  folder?: string;
}

export async function listMedia(input: ListMediaInput): Promise<PaginatedResult<MediaDto>> {
  const where: Prisma.MediaWhereInput = {
    ...(input.kind ? { kind: input.kind as never } : {}),
    ...(input.folder ? { folder: input.folder } : {}),
    ...(input.search
      ? {
          OR: [
            { originalName: { contains: input.search, mode: 'insensitive' } },
            { altText: { contains: input.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const { skip, take } = toSkipTake(input.page, input.pageSize);

  const [items, total] = await Promise.all([
    prisma.media.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      include: { uploadedBy: { select: { id: true, name: true } } },
    }),
    prisma.media.count({ where }),
  ]);

  return {
    items: items.map(toMediaDto),
    meta: buildPaginationMeta(total, input.page, input.pageSize),
  };
}

export async function getMedia(id: string): Promise<MediaDto> {
  const media = await prisma.media.findUnique({
    where: { id },
    include: { uploadedBy: { select: { id: true, name: true } } },
  });
  if (!media) throw new NotFoundError('Media');
  return toMediaDto(media);
}

export async function updateMedia(
  id: string,
  input: { altText?: string | null; folder?: string | null },
): Promise<MediaDto> {
  const media = await prisma.media.update({
    where: { id },
    data: input,
    include: { uploadedBy: { select: { id: true, name: true } } },
  });
  return toMediaDto(media);
}

/**
 * Deletion refuses while anything still references the file, so a course
 * thumbnail or lesson attachment can never become a broken link by accident.
 */
export async function deleteMedia(id: string): Promise<void> {
  const media = await prisma.media.findUnique({
    where: { id },
    select: {
      id: true,
      storageKey: true,
      storageDriver: true,
      _count: {
        select: {
          userAvatars: true,
          instructorAvatars: true,
          categoryImages: true,
          courseThumbnails: true,
          lessonPosters: true,
          lessonPdfs: true,
          lessonAttachments: true,
          blogCovers: true,
          productImages: true,
        },
      },
    },
  });
  if (!media) throw new NotFoundError('Media');

  const referenceCount = Object.values(media._count).reduce((total, count) => total + count, 0);
  if (referenceCount > 0) {
    throw new ConflictError(
      `This file is used in ${referenceCount} place(s). Remove those references first.`,
    );
  }

  // Row first, then object: a failed object delete leaves an orphan file (which
  // the cleanup job sweeps), whereas the reverse leaves a broken database row.
  await prisma.media.delete({ where: { id } });
  await deleteObject(media.storageKey, media.storageDriver);
}

/** Files nothing points at, for the storage-cleanup screen. */
export async function findUnusedMedia(olderThanDays = 30): Promise<MediaDto[]> {
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);

  const media = await prisma.media.findMany({
    where: {
      createdAt: { lt: cutoff },
      userAvatars: { none: {} },
      instructorAvatars: { none: {} },
      categoryImages: { none: {} },
      courseThumbnails: { none: {} },
      lessonPosters: { none: {} },
      lessonPdfs: { none: {} },
      lessonAttachments: { none: {} },
      blogCovers: { none: {} },
      productImages: { none: {} },
    },
    take: 200,
    orderBy: { createdAt: 'asc' },
    include: { uploadedBy: { select: { id: true, name: true } } },
  });

  return media.map(toMediaDto);
}

export async function listFolders(): Promise<string[]> {
  const rows = await prisma.media.findMany({
    where: { folder: { not: null } },
    distinct: ['folder'],
    select: { folder: true },
    orderBy: { folder: 'asc' },
  });
  return rows.map((row) => row.folder!).filter(Boolean);
}
