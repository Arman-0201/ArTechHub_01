import type { Prisma } from '@prisma/client';
import {
  COLLECTION_PANEL_COLUMNS,
  COLLECTION_PANEL_KINDS,
  COLLECTION_TONES,
  type CollectionCategoryDto,
  type CollectionDto,
  type CollectionEntryCardDto,
  type CollectionEntryDto,
  type CollectionFact,
  type CollectionIndexDto,
  type CollectionPanelColumn,
  type CollectionPanelDto,
  type CollectionPanelKind,
  type CollectionPanelLink,
  type CollectionPanelTable,
  type CollectionTone,
  type PaginatedResult,
  type PublishStatus,
} from '@academy/types';
import { prisma } from '../../lib/prisma.js';
import { ConflictError, NotFoundError } from '../../lib/errors.js';
import { buildPaginationMeta, toSkipTake } from '../../lib/http.js';
import { uniqueSlug } from '../../lib/slug.js';

/**
 * Reference collections.
 *
 * An encyclopedia of many small, similar entries — network ports, protocols,
 * commands. The point is that the hundredth entry costs the same as the first:
 * the index page, its search, its filter chips and every detail page are
 * rendered from rows rather than authored, so an editor fills in a form instead
 * of laying out a page.
 *
 * Two rules hold the whole thing together:
 *
 *   - **An entry's layout is not free-form.** `panels` is a closed set of
 *     shapes, each naming the column it sits in. That is what keeps every entry
 *     in a collection recognisably the same page, and it is why this is not
 *     simply a page with sections.
 *   - **Stored JSON is never trusted on the way out.** `panels` and `facts` are
 *     validated when written, but a row may predate a schema change or have
 *     been edited around the API, so every reader below rebuilds them field by
 *     field. A malformed panel degrades to an empty one instead of throwing
 *     inside a server render.
 */

/* -------------------------------------------------------------- json readers */

const TONES = new Set<string>(COLLECTION_TONES);
const PANEL_KINDS = new Set<string>(COLLECTION_PANEL_KINDS);
const PANEL_COLUMNS = new Set<string>(COLLECTION_PANEL_COLUMNS);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function asTone(value: unknown): CollectionTone {
  return typeof value === 'string' && TONES.has(value) ? (value as CollectionTone) : 'DEFAULT';
}

function asStringList(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string').slice(0, limit);
}

function readFacts(value: unknown): CollectionFact[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => asRecord(entry))
    .filter((entry) => typeof entry.label === 'string' && entry.label.length > 0)
    .map((entry) => ({ label: asString(entry.label), value: asString(entry.value) }))
    .slice(0, 40);
}

function readTable(value: unknown): CollectionPanelTable | null {
  const table = asRecord(value);
  const columns = asStringList(table.columns, 8);
  if (columns.length === 0) return null;

  const rows = Array.isArray(table.rows)
    ? table.rows.map((row) => asStringList(row, 8)).slice(0, 100)
    : [];

  return { columns, rows };
}

function readLinks(value: unknown): CollectionPanelLink[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => asRecord(entry))
    .filter((entry) => typeof entry.href === 'string' && typeof entry.label === 'string')
    .map((entry) => ({
      label: asString(entry.label),
      sublabel: asOptionalString(entry.sublabel),
      href: asString(entry.href),
      badge: asOptionalString(entry.badge),
      tone: asTone(entry.tone),
    }))
    .slice(0, 40);
}

function readPanels(value: unknown): CollectionPanelDto[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => asRecord(entry))
    // A panel whose kind this build does not know is dropped rather than
    // guessed at, exactly as an unknown section type is skipped by the page
    // renderer: content authored against a newer build must not break an older
    // one mid-deploy.
    .filter((entry) => typeof entry.kind === 'string' && PANEL_KINDS.has(entry.kind))
    .map((entry, index) => ({
      id: asString(entry.id, `panel-${index}`),
      kind: entry.kind as CollectionPanelKind,
      column:
        typeof entry.column === 'string' && PANEL_COLUMNS.has(entry.column)
          ? (entry.column as CollectionPanelColumn)
          : 'MAIN',
      tone: asTone(entry.tone),
      title: asString(entry.title),
      iconName: asOptionalString(entry.iconName),
      body: asOptionalString(entry.body),
      items: asStringList(entry.items, 60),
      facts: readFacts(entry.facts),
      table: readTable(entry.table),
      links: readLinks(entry.links),
    }))
    .slice(0, 30);
}

/* --------------------------------------------------------------------- shape */

const collectionSelect = {
  id: true,
  slug: true,
  name: true,
  description: true,
  iconName: true,
  eyebrow: true,
  searchPlaceholder: true,
  status: true,
  sortOrder: true,
  updatedAt: true,
  categories: {
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      slug: true,
      name: true,
      sortOrder: true,
      _count: { select: { entries: true } },
    },
  },
  _count: { select: { entries: true } },
} satisfies Prisma.CollectionSelect;

type CollectionRow = Prisma.CollectionGetPayload<{ select: typeof collectionSelect }>;

const entryCardSelect = {
  id: true,
  slug: true,
  title: true,
  subtitle: true,
  summary: true,
  badge: true,
  tone: true,
  keywords: true,
  isFeatured: true,
  status: true,
  sortOrder: true,
  category: { select: { id: true, slug: true, name: true } },
} satisfies Prisma.CollectionEntrySelect;

const entryDetailSelect = {
  ...entryCardSelect,
  facts: true,
  panels: true,
  updatedAt: true,
  publishedAt: true,
} satisfies Prisma.CollectionEntrySelect;

type EntryCardRow = Prisma.CollectionEntryGetPayload<{ select: typeof entryCardSelect }>;
type EntryDetailRow = Prisma.CollectionEntryGetPayload<{ select: typeof entryDetailSelect }>;

function toCategoryDto(
  category: CollectionRow['categories'][number],
): CollectionCategoryDto {
  return {
    id: category.id,
    slug: category.slug,
    name: category.name,
    sortOrder: category.sortOrder,
    entryCount: category._count.entries,
  };
}

function toCollectionDto(collection: CollectionRow): CollectionDto {
  return {
    id: collection.id,
    slug: collection.slug,
    name: collection.name,
    description: collection.description,
    iconName: collection.iconName,
    eyebrow: collection.eyebrow,
    searchPlaceholder: collection.searchPlaceholder,
    status: collection.status as PublishStatus,
    sortOrder: collection.sortOrder,
    categories: collection.categories.map(toCategoryDto),
    entryCount: collection._count.entries,
    updatedAt: collection.updatedAt.toISOString(),
  };
}

function toEntryCardDto(entry: EntryCardRow): CollectionEntryCardDto {
  return {
    id: entry.id,
    slug: entry.slug,
    title: entry.title,
    subtitle: entry.subtitle,
    summary: entry.summary,
    badge: entry.badge,
    tone: asTone(entry.tone),
    isFeatured: entry.isFeatured,
    category: entry.category,
    keywords: entry.keywords,
  };
}

function toEntryDto(entry: EntryDetailRow, options: { includeAdminFields?: boolean } = {}): CollectionEntryDto {
  return {
    ...toEntryCardDto(entry),
    facts: readFacts(entry.facts),
    panels: readPanels(entry.panels),
    updatedAt: entry.updatedAt.toISOString(),
    publishedAt: entry.publishedAt?.toISOString() ?? null,
    ...(options.includeAdminFields
      ? { status: entry.status as PublishStatus, sortOrder: entry.sortOrder }
      : {}),
  };
}

/* -------------------------------------------------------------------- public */

/**
 * A published collection with every published entry.
 *
 * Entries are returned whole rather than paginated: the index filters and
 * searches in the browser, which is what makes typing feel instant, and a
 * reference collection is bounded by its subject — there are 65,535 ports but
 * nobody documents more than a few hundred. `MAX_PUBLIC_ENTRIES` is the guard
 * that keeps that assumption from becoming a slow page if someone tries.
 */
const MAX_PUBLIC_ENTRIES = 500;

export async function getPublicCollection(slug: string): Promise<CollectionIndexDto> {
  const collection = await prisma.collection.findFirst({
    where: { slug, status: 'PUBLISHED', deletedAt: null },
    select: collectionSelect,
  });
  if (!collection) throw new NotFoundError('Collection');

  const entries = await prisma.collectionEntry.findMany({
    where: { collectionId: collection.id, status: 'PUBLISHED' },
    orderBy: [{ isFeatured: 'desc' }, { sortOrder: 'asc' }, { title: 'asc' }],
    take: MAX_PUBLIC_ENTRIES,
    select: entryCardSelect,
  });

  return {
    collection: toCollectionDto(collection),
    entries: entries.map(toEntryCardDto),
  };
}

export async function getPublicEntry(
  collectionSlug: string,
  entrySlug: string,
): Promise<{ collection: CollectionDto; entry: CollectionEntryDto }> {
  const collection = await prisma.collection.findFirst({
    where: { slug: collectionSlug, status: 'PUBLISHED', deletedAt: null },
    select: collectionSelect,
  });
  if (!collection) throw new NotFoundError('Collection');

  const entry = await prisma.collectionEntry.findFirst({
    where: { collectionId: collection.id, slug: entrySlug, status: 'PUBLISHED' },
    select: entryDetailSelect,
  });
  if (!entry) throw new NotFoundError('Entry');

  return { collection: toCollectionDto(collection), entry: toEntryDto(entry) };
}

/** Every published collection, for sitemaps and the section picker. */
export async function listPublicCollections(): Promise<CollectionDto[]> {
  const collections = await prisma.collection.findMany({
    where: { status: 'PUBLISHED', deletedAt: null },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: collectionSelect,
  });
  return collections.map(toCollectionDto);
}

/* --------------------------------------------------------------------- admin */

export async function listCollections(): Promise<CollectionDto[]> {
  const collections = await prisma.collection.findMany({
    where: { deletedAt: null },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: collectionSelect,
  });
  return collections.map(toCollectionDto);
}

export async function getCollection(id: string): Promise<CollectionDto> {
  const collection = await prisma.collection.findFirst({
    where: { id, deletedAt: null },
    select: collectionSelect,
  });
  if (!collection) throw new NotFoundError('Collection');
  return toCollectionDto(collection);
}

export interface CollectionInput {
  name: string;
  slug?: string;
  description?: string | null;
  iconName?: string | null;
  eyebrow?: string | null;
  searchPlaceholder?: string | null;
  status?: PublishStatus;
  sortOrder?: number;
}

async function collectionSlugTaken(candidate: string, exceptId?: string): Promise<boolean> {
  const existing = await prisma.collection.findUnique({
    where: { slug: candidate },
    select: { id: true },
  });
  return Boolean(existing && existing.id !== exceptId);
}

export async function createCollection(input: CollectionInput): Promise<CollectionDto> {
  const slug = input.slug
    ? input.slug
    : await uniqueSlug(input.name, (candidate) => collectionSlugTaken(candidate), {
        fallbackPrefix: 'collection',
      });

  if (input.slug && (await collectionSlugTaken(slug))) {
    throw new ConflictError('A collection with that slug already exists');
  }

  const collection = await prisma.collection.create({
    data: {
      slug,
      name: input.name,
      description: input.description ?? null,
      iconName: input.iconName ?? null,
      eyebrow: input.eyebrow ?? null,
      searchPlaceholder: input.searchPlaceholder ?? null,
      ...(input.status ? { status: input.status } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
    },
    select: collectionSelect,
  });

  return toCollectionDto(collection);
}

export async function updateCollection(
  id: string,
  input: Partial<CollectionInput>,
): Promise<CollectionDto> {
  const existing = await prisma.collection.findFirst({
    where: { id, deletedAt: null },
    select: { id: true },
  });
  if (!existing) throw new NotFoundError('Collection');

  if (input.slug && (await collectionSlugTaken(input.slug, id))) {
    throw new ConflictError('A collection with that slug already exists');
  }

  const collection = await prisma.collection.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.slug !== undefined ? { slug: input.slug } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.iconName !== undefined ? { iconName: input.iconName } : {}),
      ...(input.eyebrow !== undefined ? { eyebrow: input.eyebrow } : {}),
      ...(input.searchPlaceholder !== undefined
        ? { searchPlaceholder: input.searchPlaceholder }
        : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
    },
    select: collectionSelect,
  });

  return toCollectionDto(collection);
}

/**
 * Soft delete, like pages and courses: a collection is a URL that visitors may
 * have bookmarked and other content may link to, so it is withdrawn rather than
 * erased. Its entries go with it — they are unreachable without it.
 */
export async function deleteCollection(id: string): Promise<void> {
  const existing = await prisma.collection.findFirst({
    where: { id, deletedAt: null },
    select: { id: true },
  });
  if (!existing) throw new NotFoundError('Collection');

  await prisma.collection.update({
    where: { id },
    data: { deletedAt: new Date(), status: 'ARCHIVED' },
  });
}

/* ---------------------------------------------------------------- categories */

export interface CollectionCategoryInput {
  name: string;
  slug?: string;
  sortOrder?: number;
}

export async function createCollectionCategory(
  collectionId: string,
  input: CollectionCategoryInput,
): Promise<CollectionCategoryDto> {
  const collection = await prisma.collection.findFirst({
    where: { id: collectionId, deletedAt: null },
    select: { id: true },
  });
  if (!collection) throw new NotFoundError('Collection');

  const slug =
    input.slug ??
    (await uniqueSlug(
      input.name,
      async (candidate) =>
        Boolean(
          await prisma.collectionCategory.findUnique({
            where: { collectionId_slug: { collectionId, slug: candidate } },
            select: { id: true },
          }),
        ),
      { fallbackPrefix: 'group' },
    ));

  const existing = await prisma.collectionCategory.findUnique({
    where: { collectionId_slug: { collectionId, slug } },
    select: { id: true },
  });
  if (existing) throw new ConflictError('That filter already exists in this collection');

  const category = await prisma.collectionCategory.create({
    data: {
      collectionId,
      slug,
      name: input.name,
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
    },
    select: {
      id: true,
      slug: true,
      name: true,
      sortOrder: true,
      _count: { select: { entries: true } },
    },
  });

  return toCategoryDto(category);
}

export async function updateCollectionCategory(
  id: string,
  input: Partial<CollectionCategoryInput>,
): Promise<CollectionCategoryDto> {
  const category = await prisma.collectionCategory.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.slug !== undefined ? { slug: input.slug } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
    },
    select: {
      id: true,
      slug: true,
      name: true,
      sortOrder: true,
      _count: { select: { entries: true } },
    },
  });

  return toCategoryDto(category);
}

/**
 * Deleting a filter leaves its entries in place and uncategorised — the
 * schema's `onDelete: SetNull` — because an editor tidying up the chips above a
 * grid is not asking to delete a hundred documented entries.
 */
export async function deleteCollectionCategory(id: string): Promise<void> {
  const existing = await prisma.collectionCategory.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) throw new NotFoundError('Filter');

  await prisma.collectionCategory.delete({ where: { id } });
}

/* ------------------------------------------------------------------- entries */

export interface ListEntriesInput {
  collectionId: string;
  page: number;
  pageSize: number;
  search?: string;
  status?: PublishStatus;
  categoryId?: string;
}

export async function listEntries(
  input: ListEntriesInput,
): Promise<PaginatedResult<CollectionEntryDto>> {
  const where: Prisma.CollectionEntryWhereInput = {
    collectionId: input.collectionId,
    ...(input.status ? { status: input.status } : {}),
    ...(input.categoryId ? { categoryId: input.categoryId } : {}),
    ...(input.search
      ? {
          OR: [
            { title: { contains: input.search, mode: 'insensitive' } },
            { subtitle: { contains: input.search, mode: 'insensitive' } },
            { slug: { contains: input.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const { skip, take } = toSkipTake(input.page, input.pageSize);

  const [items, total] = await Promise.all([
    prisma.collectionEntry.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
      skip,
      take,
      select: entryDetailSelect,
    }),
    prisma.collectionEntry.count({ where }),
  ]);

  return {
    items: items.map((entry) => toEntryDto(entry, { includeAdminFields: true })),
    meta: buildPaginationMeta(total, input.page, input.pageSize),
  };
}

export async function getEntry(id: string): Promise<CollectionEntryDto> {
  const entry = await prisma.collectionEntry.findUnique({
    where: { id },
    select: entryDetailSelect,
  });
  if (!entry) throw new NotFoundError('Entry');
  return toEntryDto(entry, { includeAdminFields: true });
}

export interface CollectionEntryInput {
  title: string;
  slug?: string;
  subtitle?: string | null;
  summary?: string | null;
  badge?: string | null;
  tone?: CollectionTone;
  categoryId?: string | null;
  isFeatured?: boolean;
  status?: PublishStatus;
  sortOrder?: number;
  keywords?: string[];
  facts?: CollectionFact[];
  panels?: CollectionPanelDto[];
}

async function entrySlugTaken(
  collectionId: string,
  candidate: string,
  exceptId?: string,
): Promise<boolean> {
  const existing = await prisma.collectionEntry.findUnique({
    where: { collectionId_slug: { collectionId, slug: candidate } },
    select: { id: true },
  });
  return Boolean(existing && existing.id !== exceptId);
}

/**
 * `publishedAt` is stamped the first time an entry becomes published and never
 * moved afterwards, so re-saving a live entry does not make it look new.
 */
function publishedAtFor(
  status: PublishStatus | undefined,
  current: { status: string; publishedAt: Date | null } | null,
): Date | null | undefined {
  if (status !== 'PUBLISHED') return status === undefined ? undefined : null;
  if (current?.publishedAt) return current.publishedAt;
  return new Date();
}

export async function createEntry(
  collectionId: string,
  input: CollectionEntryInput,
): Promise<CollectionEntryDto> {
  const collection = await prisma.collection.findFirst({
    where: { id: collectionId, deletedAt: null },
    select: { id: true },
  });
  if (!collection) throw new NotFoundError('Collection');

  const slug =
    input.slug ??
    (await uniqueSlug(input.title, (candidate) => entrySlugTaken(collectionId, candidate), {
      fallbackPrefix: 'entry',
    }));

  if (input.slug && (await entrySlugTaken(collectionId, slug))) {
    throw new ConflictError('An entry with that slug already exists in this collection');
  }

  const entry = await prisma.collectionEntry.create({
    data: {
      collectionId,
      slug,
      title: input.title,
      subtitle: input.subtitle ?? null,
      summary: input.summary ?? null,
      badge: input.badge ?? null,
      tone: input.tone ?? 'DEFAULT',
      categoryId: input.categoryId ?? null,
      keywords: input.keywords ?? [],
      facts: (input.facts ?? []) as unknown as Prisma.InputJsonValue,
      panels: (input.panels ?? []) as unknown as Prisma.InputJsonValue,
      ...(input.isFeatured !== undefined ? { isFeatured: input.isFeatured } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      publishedAt: publishedAtFor(input.status, null) ?? null,
    },
    select: entryDetailSelect,
  });

  return toEntryDto(entry, { includeAdminFields: true });
}

export async function updateEntry(
  id: string,
  input: Partial<CollectionEntryInput>,
): Promise<CollectionEntryDto> {
  const current = await prisma.collectionEntry.findUnique({
    where: { id },
    select: { id: true, collectionId: true, status: true, publishedAt: true },
  });
  if (!current) throw new NotFoundError('Entry');

  if (input.slug && (await entrySlugTaken(current.collectionId, input.slug, id))) {
    throw new ConflictError('An entry with that slug already exists in this collection');
  }

  const publishedAt = publishedAtFor(input.status, current);

  const entry = await prisma.collectionEntry.update({
    where: { id },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.slug !== undefined ? { slug: input.slug } : {}),
      ...(input.subtitle !== undefined ? { subtitle: input.subtitle } : {}),
      ...(input.summary !== undefined ? { summary: input.summary } : {}),
      ...(input.badge !== undefined ? { badge: input.badge } : {}),
      ...(input.tone !== undefined ? { tone: input.tone } : {}),
      ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
      ...(input.isFeatured !== undefined ? { isFeatured: input.isFeatured } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      ...(input.keywords !== undefined ? { keywords: input.keywords } : {}),
      ...(input.facts !== undefined
        ? { facts: input.facts as unknown as Prisma.InputJsonValue }
        : {}),
      ...(input.panels !== undefined
        ? { panels: input.panels as unknown as Prisma.InputJsonValue }
        : {}),
      ...(publishedAt !== undefined ? { publishedAt } : {}),
    },
    select: entryDetailSelect,
  });

  return toEntryDto(entry, { includeAdminFields: true });
}

/** Hard delete: an entry is one row and one URL, with nothing depending on it. */
export async function deleteEntry(id: string): Promise<void> {
  const existing = await prisma.collectionEntry.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) throw new NotFoundError('Entry');

  await prisma.collectionEntry.delete({ where: { id } });
}

export async function reorderEntries(items: { id: string; sortOrder: number }[]): Promise<void> {
  await prisma.$transaction(
    items.map((item) =>
      prisma.collectionEntry.update({
        where: { id: item.id },
        data: { sortOrder: item.sortOrder },
      }),
    ),
  );
}
