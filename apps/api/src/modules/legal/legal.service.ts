import type { LegalDocumentDto, RichTextDocument } from '@academy/types';
import { jsonOrDbNull, prisma } from '../../lib/prisma.js';
import { BadRequestError, NotFoundError } from '../../lib/errors.js';
import { CACHE_KEYS, platformCache } from '../../lib/cache.js';

/**
 * Legal documents are versioned because consent is only meaningful against a
 * specific text. Registration records which *version* the user accepted, and
 * publishing a new version leaves those historical acceptances intact.
 */

function toDto(document: {
  id: string;
  slug: string;
  title: string;
  requiresAcceptance: boolean;
  updatedAt: Date;
  versions: { id: string; version: string; body: unknown; effectiveAt: Date }[];
}): LegalDocumentDto {
  const current = document.versions[0];
  return {
    id: document.id,
    slug: document.slug,
    title: document.title,
    requiresAcceptance: document.requiresAcceptance,
    currentVersion: current
      ? {
          id: current.id,
          version: current.version,
          body: (current.body as RichTextDocument | null) ?? null,
          effectiveAt: current.effectiveAt.toISOString(),
        }
      : null,
    updatedAt: document.updatedAt.toISOString(),
  };
}

export async function listLegalDocuments(): Promise<LegalDocumentDto[]> {
  const documents = await prisma.legalDocument.findMany({
    orderBy: { sortOrder: 'asc' },
    include: {
      versions: {
        where: { isCurrent: true },
        select: { id: true, version: true, body: true, effectiveAt: true },
        take: 1,
      },
    },
  });
  return documents.map(toDto);
}

export async function getLegalDocument(slug: string): Promise<LegalDocumentDto> {
  const document = await prisma.legalDocument.findUnique({
    where: { slug },
    include: {
      versions: {
        where: { isCurrent: true },
        select: { id: true, version: true, body: true, effectiveAt: true },
        take: 1,
      },
    },
  });
  if (!document) throw new NotFoundError('Legal document');
  return toDto(document);
}

/** Slug + title pairs for the footer, cached because the footer is on every page. */
export async function getLegalLinks(): Promise<{ slug: string; title: string }[]> {
  return platformCache.remember(
    CACHE_KEYS.legalLinks,
    async () =>
      prisma.legalDocument.findMany({
        where: { versions: { some: { isCurrent: true } } },
        orderBy: { sortOrder: 'asc' },
        select: { slug: true, title: true },
      }),
    120_000,
  );
}

/**
 * Version ids of every document a new account must accept.
 * Returned as ids (not slugs) so the acceptance row points at immutable text.
 */
export async function getRequiredLegalVersions(): Promise<string[]> {
  const documents = await prisma.legalDocument.findMany({
    where: { requiresAcceptance: true },
    select: { versions: { where: { isCurrent: true }, select: { id: true }, take: 1 } },
  });

  return documents
    .map((document) => document.versions[0]?.id)
    .filter((id): id is string => Boolean(id));
}

export async function listVersions(documentId: string) {
  const versions = await prisma.legalDocumentVersion.findMany({
    where: { documentId },
    orderBy: { effectiveAt: 'desc' },
    select: {
      id: true,
      version: true,
      effectiveAt: true,
      isCurrent: true,
      createdAt: true,
      _count: { select: { acceptances: true } },
    },
  });

  return versions.map((version) => ({
    id: version.id,
    version: version.version,
    effectiveAt: version.effectiveAt.toISOString(),
    isCurrent: version.isCurrent,
    createdAt: version.createdAt.toISOString(),
    acceptanceCount: version._count.acceptances,
  }));
}

export async function createDocument(input: {
  slug: string;
  title: string;
  requiresAcceptance?: boolean;
}): Promise<LegalDocumentDto> {
  const document = await prisma.legalDocument.create({
    data: {
      slug: input.slug,
      title: input.title,
      requiresAcceptance: input.requiresAcceptance ?? false,
    },
    include: { versions: { where: { isCurrent: true }, take: 1 } },
  });
  platformCache.invalidate(CACHE_KEYS.legalLinks);
  return toDto(document);
}

export async function updateDocument(
  id: string,
  input: { title?: string; requiresAcceptance?: boolean },
): Promise<LegalDocumentDto> {
  const document = await prisma.legalDocument.update({
    where: { id },
    data: input,
    include: { versions: { where: { isCurrent: true }, take: 1 } },
  });
  platformCache.invalidate(CACHE_KEYS.legalLinks);
  return toDto(document);
}

/**
 * Publishing a version demotes the previous current one in the same
 * transaction, so there is never a moment with two (or zero) current versions.
 */
export async function publishVersion(
  documentId: string,
  input: { version: string; body: RichTextDocument | null; effectiveAt?: Date; publish?: boolean },
) {
  const document = await prisma.legalDocument.findUnique({
    where: { id: documentId },
    select: { id: true },
  });
  if (!document) throw new NotFoundError('Legal document');

  const shouldPublish = input.publish ?? true;

  const existing = await prisma.legalDocumentVersion.findUnique({
    where: { documentId_version: { documentId, version: input.version } },
    select: { id: true },
  });
  if (existing) {
    throw new BadRequestError(`Version ${input.version} already exists for this document`);
  }

  const [, version] = await prisma.$transaction([
    prisma.legalDocumentVersion.updateMany({
      where: { documentId, isCurrent: true },
      data: shouldPublish ? { isCurrent: false } : {},
    }),
    prisma.legalDocumentVersion.create({
      data: {
        documentId,
        version: input.version,
        body: jsonOrDbNull(input.body),
        effectiveAt: input.effectiveAt ?? new Date(),
        isCurrent: shouldPublish,
      },
    }),
  ]);

  platformCache.invalidate(CACHE_KEYS.legalLinks);
  return version;
}

/** Documents the signed-in user has not yet accepted the current version of. */
export async function getPendingAcceptances(userId: string): Promise<LegalDocumentDto[]> {
  const documents = await prisma.legalDocument.findMany({
    where: { requiresAcceptance: true },
    include: {
      versions: {
        where: { isCurrent: true },
        select: { id: true, version: true, body: true, effectiveAt: true },
        take: 1,
      },
    },
  });

  const currentVersionIds = documents
    .map((document) => document.versions[0]?.id)
    .filter((id): id is string => Boolean(id));

  if (currentVersionIds.length === 0) return [];

  const accepted = await prisma.userLegalAcceptance.findMany({
    where: { userId, versionId: { in: currentVersionIds } },
    select: { versionId: true },
  });
  const acceptedIds = new Set(accepted.map((entry) => entry.versionId));

  return documents
    .filter((document) => {
      const currentId = document.versions[0]?.id;
      return currentId && !acceptedIds.has(currentId);
    })
    .map(toDto);
}

export async function recordAcceptances(
  userId: string,
  versionIds: string[],
  ipAddress?: string,
): Promise<void> {
  const valid = await prisma.legalDocumentVersion.findMany({
    where: { id: { in: versionIds }, isCurrent: true },
    select: { id: true },
  });

  if (valid.length === 0) throw new BadRequestError('No current document versions to accept');

  await prisma.userLegalAcceptance.createMany({
    data: valid.map((version) => ({ userId, versionId: version.id, ipAddress: ipAddress ?? null })),
    skipDuplicates: true,
  });
}
