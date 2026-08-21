import type { MediaDto, MediaKind } from '@academy/types';
import { publicUrlForKey } from '../../lib/storage.js';

export interface MediaUrlSource {
  url?: string | null;
  storageKey: string;
  storageDriver: string;
}

/**
 * Stored `url` columns are a cache of the public URL at upload time. If the
 * storage host later changes (moving from local disk to S3, or a new CDN
 * domain), the key is still authoritative — so the URL is recomputed whenever
 * the stored one no longer matches the active driver.
 */
export function resolveMediaUrl(media: MediaUrlSource): string {
  if (media.url && media.url.length > 0) return media.url;
  return publicUrlForKey(media.storageKey, media.storageDriver);
}

const KIND_BY_MIME_PREFIX: [string, MediaKind][] = [
  ['image/', 'IMAGE'],
  ['video/', 'VIDEO'],
  ['audio/', 'AUDIO'],
];

export function mediaKindForMime(mimeType: string): MediaKind {
  for (const [prefix, kind] of KIND_BY_MIME_PREFIX) {
    if (mimeType.startsWith(prefix)) return kind;
  }
  if (
    mimeType === 'application/pdf' ||
    mimeType.startsWith('text/') ||
    mimeType.includes('word') ||
    mimeType.includes('spreadsheet')
  ) {
    return 'DOCUMENT';
  }
  return 'OTHER';
}

export interface MediaRecord {
  id: string;
  kind: string;
  fileName: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  storageDriver: string;
  url: string | null;
  width: number | null;
  height: number | null;
  altText: string | null;
  folder: string | null;
  createdAt: Date;
  uploadedBy?: { id: string; name: string } | null;
}

export function toMediaDto(media: MediaRecord): MediaDto {
  return {
    id: media.id,
    kind: media.kind as MediaKind,
    fileName: media.fileName,
    originalName: media.originalName,
    mimeType: media.mimeType,
    sizeBytes: media.sizeBytes,
    url: resolveMediaUrl(media),
    width: media.width,
    height: media.height,
    altText: media.altText,
    folder: media.folder,
    createdAt: media.createdAt.toISOString(),
    uploadedBy: media.uploadedBy ?? null,
  };
}
