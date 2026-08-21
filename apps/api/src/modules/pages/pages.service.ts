import type { Prisma } from '@prisma/client';
import type { PageDto, PageSectionDto, PaginatedResult, SectionType, SeoDto } from '@academy/types';
import { jsonOrJsonNull, prisma } from '../../lib/prisma.js';
import { BadRequestError, NotFoundError } from '../../lib/errors.js';
import { buildPaginationMeta, toSkipTake } from '../../lib/http.js';
import { uniqueSlug } from '../../lib/slug.js';
import { sanitizeRichHtml } from '../../lib/sanitize.js';
import { mergeTranslatedContent, pickTranslation, applyTranslation } from '../translations/translation.helpers.js';
import { toSeoDto, upsertSeo } from '../seo/seo.service.js';

/**
 * Dynamic pages are a page row plus an ordered list of typed sections.
 *
 * The deliberate constraint: a section carries `type` + two JSON blobs, and the
 * frontend renders it through a component registry. There is no template
 * language and no arbitrary markup path (the one HTML section type is
 * sanitised on write), so a compromised editor account cannot turn the CMS into
 * a script-injection tool.
 */

const pageSelect = {
  id: true,
  slug: true,
  title: true,
  status: true,
  isEnabled: true,
  isSystem: true,
  template: true,
  updatedAt: true,
  publishedAt: true,
  seo: true,
  translations: { select: { locale: true, title: true } },
  sections: {
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true,
      type: true,
      sortOrder: true,
      isVisible: true,
      settings: true,
      content: true,
      translations: { select: { locale: true, content: true } },
    },
  },
} satisfies Prisma.PageSelect;

type PageRow = Prisma.PageGetPayload<{ select: typeof pageSelect }>;

function toSectionDto(
  section: PageRow['sections'][number],
  locale: string,
): PageSectionDto {
  const translation = pickTranslation(section.translations, locale);
  return {
    id: section.id,
    type: section.type as SectionType,
    sortOrder: section.sortOrder,
    isVisible: section.isVisible,
    settings: (section.settings as Record<string, unknown>) ?? {},
    content: mergeTranslatedContent(
      (section.content as Record<string, unknown>) ?? {},
      (translation?.content as Record<string, unknown>) ?? null,
    ),
  };
}

function toPageDto(page: PageRow, locale: string, includeHidden: boolean): PageDto {
  const translation = pickTranslation(page.translations, locale);
  return {
    id: page.id,
    slug: page.slug,
    title: applyTranslation(page.title, translation?.title),
    status: page.status,
    isEnabled: page.isEnabled,
    isSystem: page.isSystem,
    template: page.template,
    sections: page.sections
      .filter((section) => includeHidden || section.isVisible)
      .map((section) => toSectionDto(section, locale)),
    seo: page.seo ? toSeoDto(page.seo) : null,
    updatedAt: page.updatedAt.toISOString(),
    publishedAt: page.publishedAt?.toISOString() ?? null,
  };
}

/* ------------------------------------------------------------------ reads */

export async function getPublicPage(slug: string, locale: string): Promise<PageDto> {
  const page = await prisma.page.findFirst({
    where: { slug, status: 'PUBLISHED', isEnabled: true, deletedAt: null },
    select: pageSelect,
  });
  // A disabled page answers 404 rather than 403, so probing cannot map which
  // pages exist behind the scenes.
  if (!page) throw new NotFoundError('Page');
  return toPageDto(page, locale, false);
}

export async function getPageById(id: string, locale: string): Promise<PageDto> {
  const page = await prisma.page.findFirst({ where: { id, deletedAt: null }, select: pageSelect });
  if (!page) throw new NotFoundError('Page');
  return toPageDto(page, locale, true);
}

export interface ListPagesInput {
  locale: string;
  page: number;
  pageSize: number;
  search?: string;
  status?: string;
  isEnabled?: boolean;
}

export async function listPages(input: ListPagesInput): Promise<PaginatedResult<PageDto>> {
  const where: Prisma.PageWhereInput = {
    deletedAt: null,
    ...(input.status ? { status: input.status as never } : {}),
    ...(input.isEnabled !== undefined ? { isEnabled: input.isEnabled } : {}),
    ...(input.search
      ? {
          OR: [
            { title: { contains: input.search, mode: 'insensitive' } },
            { slug: { contains: input.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const { skip, take } = toSkipTake(input.page, input.pageSize);

  const [pages, total] = await Promise.all([
    prisma.page.findMany({
      where,
      orderBy: [{ isSystem: 'desc' }, { updatedAt: 'desc' }],
      skip,
      take,
      select: pageSelect,
    }),
    prisma.page.count({ where }),
  ]);

  return {
    items: pages.map((page) => toPageDto(page, input.locale, true)),
    meta: buildPaginationMeta(total, input.page, input.pageSize),
  };
}

/** Slugs of every enabled page — lets the web app avoid rendering dead links. */
export async function listEnabledPageSlugs(): Promise<string[]> {
  const pages = await prisma.page.findMany({
    where: { status: 'PUBLISHED', isEnabled: true, deletedAt: null },
    select: { slug: true },
  });
  return pages.map((page) => page.slug);
}

/* -------------------------------------------------------------- mutations */

export interface PageInput {
  title: string;
  slug?: string;
  status?: string;
  isEnabled?: boolean;
  template?: string;
  seo?: Partial<SeoDto>;
}

export async function createPage(input: PageInput, locale: string): Promise<PageDto> {
  const slug = await uniqueSlug(
    input.slug ?? input.title,
    async (candidate) => (await prisma.page.count({ where: { slug: candidate } })) > 0,
    { fallbackPrefix: 'page' },
  );

  const page = await prisma.page.create({
    data: {
      slug,
      title: input.title,
      status: (input.status as never) ?? 'DRAFT',
      isEnabled: input.isEnabled ?? true,
      template: input.template ?? 'default',
      publishedAt: input.status === 'PUBLISHED' ? new Date() : null,
    },
    select: { id: true },
  });

  if (input.seo) await upsertSeo({ pageId: page.id }, input.seo);

  return getPageById(page.id, locale);
}

export async function updatePage(
  id: string,
  input: Partial<PageInput>,
  locale: string,
): Promise<PageDto> {
  const existing = await prisma.page.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, slug: true, isSystem: true, status: true, publishedAt: true },
  });
  if (!existing) throw new NotFoundError('Page');

  // System pages back hardcoded routes; renaming their slug would break them.
  if (existing.isSystem && input.slug && input.slug !== existing.slug) {
    throw new BadRequestError('The slug of a system page cannot be changed');
  }

  const slug =
    input.slug && input.slug !== existing.slug
      ? await uniqueSlug(
          input.slug,
          async (candidate) =>
            (await prisma.page.count({ where: { slug: candidate, id: { not: id } } })) > 0,
          { fallbackPrefix: 'page' },
        )
      : undefined;

  await prisma.page.update({
    where: { id },
    data: {
      ...(slug ? { slug } : {}),
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.status !== undefined ? { status: input.status as never } : {}),
      ...(input.isEnabled !== undefined ? { isEnabled: input.isEnabled } : {}),
      ...(input.template !== undefined ? { template: input.template } : {}),
      ...(input.status === 'PUBLISHED' && !existing.publishedAt ? { publishedAt: new Date() } : {}),
    },
  });

  if (input.seo) await upsertSeo({ pageId: id }, input.seo);

  return getPageById(id, locale);
}

export async function deletePage(id: string): Promise<void> {
  const page = await prisma.page.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, isSystem: true },
  });
  if (!page) throw new NotFoundError('Page');
  if (page.isSystem) {
    throw new BadRequestError('System pages can be disabled but not deleted');
  }
  await prisma.page.update({ where: { id }, data: { deletedAt: new Date(), isEnabled: false } });
}

/* --------------------------------------------------------------- sections */

export interface SectionInput {
  type: string;
  sortOrder?: number;
  isVisible?: boolean;
  settings?: Record<string, unknown>;
  content?: Record<string, unknown>;
}

/**
 * The HTML section is the one place raw markup can enter the CMS, so it is
 * sanitised on the way in (not only on render) — a stored payload never
 * survives long enough to reach any renderer that might forget to escape it.
 */
function sanitizeSectionContent(
  type: string,
  content: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!content) return {};
  if (type !== 'HTML') return content;

  const html = typeof content.html === 'string' ? content.html : '';
  return { ...content, html: sanitizeRichHtml(html) };
}

export async function addSection(
  pageId: string,
  input: SectionInput,
  locale: string,
): Promise<PageDto> {
  const page = await prisma.page.findFirst({
    where: { id: pageId, deletedAt: null },
    select: { id: true },
  });
  if (!page) throw new NotFoundError('Page');

  const sortOrder =
    input.sortOrder ??
    ((await prisma.pageSection.aggregate({ where: { pageId }, _max: { sortOrder: true } }))._max
      .sortOrder ?? -1) + 1;

  await prisma.pageSection.create({
    data: {
      pageId,
      type: input.type as never,
      sortOrder,
      isVisible: input.isVisible ?? true,
      settings: jsonOrJsonNull(input.settings ?? {}),
      content: jsonOrJsonNull(sanitizeSectionContent(input.type, input.content)),
    },
  });

  return getPageById(pageId, locale);
}

export async function updateSection(
  sectionId: string,
  input: Partial<SectionInput>,
  locale: string,
): Promise<PageDto> {
  const section = await prisma.pageSection.findUnique({
    where: { id: sectionId },
    select: { id: true, pageId: true, type: true },
  });
  if (!section) throw new NotFoundError('Section');

  const type = input.type ?? section.type;

  await prisma.pageSection.update({
    where: { id: sectionId },
    data: {
      ...(input.type !== undefined ? { type: input.type as never } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      ...(input.isVisible !== undefined ? { isVisible: input.isVisible } : {}),
      ...(input.settings !== undefined ? { settings: jsonOrJsonNull(input.settings) } : {}),
      ...(input.content !== undefined
        ? { content: jsonOrJsonNull(sanitizeSectionContent(type, input.content)) }
        : {}),
    },
  });

  return getPageById(section.pageId, locale);
}

export async function deleteSection(sectionId: string, locale: string): Promise<PageDto> {
  const section = await prisma.pageSection.findUnique({
    where: { id: sectionId },
    select: { id: true, pageId: true },
  });
  if (!section) throw new NotFoundError('Section');

  await prisma.pageSection.delete({ where: { id: sectionId } });
  return getPageById(section.pageId, locale);
}

export async function duplicateSection(sectionId: string, locale: string): Promise<PageDto> {
  const section = await prisma.pageSection.findUnique({ where: { id: sectionId } });
  if (!section) throw new NotFoundError('Section');

  // The copy lands directly beneath the original, and everything after it is
  // pushed down so the ordering stays dense.
  await prisma.$transaction([
    prisma.pageSection.updateMany({
      where: { pageId: section.pageId, sortOrder: { gt: section.sortOrder } },
      data: { sortOrder: { increment: 1 } },
    }),
    prisma.pageSection.create({
      data: {
        pageId: section.pageId,
        type: section.type,
        sortOrder: section.sortOrder + 1,
        isVisible: section.isVisible,
        settings: jsonOrJsonNull(section.settings),
        content: jsonOrJsonNull(section.content),
      },
    }),
  ]);

  return getPageById(section.pageId, locale);
}

/** Drag-and-drop reordering: the client sends the full ordered id list. */
export async function reorderSections(
  pageId: string,
  sectionIds: string[],
  locale: string,
): Promise<PageDto> {
  const owned = await prisma.pageSection.findMany({
    where: { pageId },
    select: { id: true },
  });
  const ownedIds = new Set(owned.map((section) => section.id));

  // Reject the whole operation if any id is foreign — a partial apply would
  // leave the page in a half-reordered state.
  if (sectionIds.some((id) => !ownedIds.has(id))) {
    throw new BadRequestError('One or more sections do not belong to this page');
  }

  await prisma.$transaction(
    sectionIds.map((id, index) =>
      prisma.pageSection.update({ where: { id }, data: { sortOrder: index } }),
    ),
  );

  return getPageById(pageId, locale);
}

export async function upsertSectionTranslation(
  sectionId: string,
  locale: string,
  content: Record<string, unknown>,
): Promise<void> {
  const section = await prisma.pageSection.findUnique({
    where: { id: sectionId },
    select: { type: true },
  });
  if (!section) throw new NotFoundError('Section');

  const safe = sanitizeSectionContent(section.type, content);

  await prisma.sectionTranslation.upsert({
    where: { sectionId_locale: { sectionId, locale } },
    create: { sectionId, locale, content: jsonOrJsonNull(safe) },
    update: { content: jsonOrJsonNull(safe) },
  });
}
