import type { SeoDto } from '@academy/types';
import { jsonOrDbNull, prisma } from '../../lib/prisma.js';

/**
 * SEO metadata is a single side table with one nullable foreign key per
 * entity type plus a `routeKey` for hardcoded routes such as `/courses`.
 * One table means one shape of form, one renderer and one sitemap query.
 */

export interface SeoRow {
  title: string | null;
  description: string | null;
  keywords: string[];
  canonicalUrl: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImageUrl: string | null;
  twitterCard: string | null;
  robots: string | null;
  structuredData: unknown;
}

export function toSeoDto(row: SeoRow): SeoDto {
  return {
    title: row.title,
    description: row.description,
    keywords: row.keywords,
    canonicalUrl: row.canonicalUrl,
    ogTitle: row.ogTitle,
    ogDescription: row.ogDescription,
    ogImageUrl: row.ogImageUrl,
    twitterCard: row.twitterCard,
    robots: row.robots,
    structuredData: (row.structuredData as Record<string, unknown> | null) ?? null,
  };
}

export type SeoOwner =
  | { pageId: string }
  | { courseId: string }
  | { categoryId: string }
  | { blogPostId: string }
  | { productId: string }
  | { routeKey: string };

function ownerWhere(owner: SeoOwner) {
  // Each foreign key is unique, so every branch addresses at most one row.
  if ('pageId' in owner) return { pageId: owner.pageId };
  if ('courseId' in owner) return { courseId: owner.courseId };
  if ('categoryId' in owner) return { categoryId: owner.categoryId };
  if ('blogPostId' in owner) return { blogPostId: owner.blogPostId };
  if ('productId' in owner) return { productId: owner.productId };
  return { routeKey: owner.routeKey };
}

export async function upsertSeo(owner: SeoOwner, input: Partial<SeoDto>): Promise<SeoDto> {
  const where = ownerWhere(owner);

  const data = {
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.keywords !== undefined ? { keywords: input.keywords } : {}),
    ...(input.canonicalUrl !== undefined ? { canonicalUrl: input.canonicalUrl } : {}),
    ...(input.ogTitle !== undefined ? { ogTitle: input.ogTitle } : {}),
    ...(input.ogDescription !== undefined ? { ogDescription: input.ogDescription } : {}),
    ...(input.ogImageUrl !== undefined ? { ogImageUrl: input.ogImageUrl } : {}),
    ...(input.twitterCard !== undefined ? { twitterCard: input.twitterCard } : {}),
    ...(input.robots !== undefined ? { robots: input.robots } : {}),
    ...(input.structuredData !== undefined
      ? { structuredData: jsonOrDbNull(input.structuredData) }
      : {}),
  };

  const row = await prisma.seoMetadata.upsert({
    where: where as never,
    create: { ...where, ...data } as never,
    update: data,
  });

  return toSeoDto(row);
}

export async function getSeoByRoute(routeKey: string): Promise<SeoDto | null> {
  const row = await prisma.seoMetadata.findUnique({ where: { routeKey } });
  return row ? toSeoDto(row) : null;
}

export async function deleteSeo(owner: SeoOwner): Promise<void> {
  await prisma.seoMetadata.deleteMany({ where: ownerWhere(owner) as never });
}

/**
 * Sitemap input: every publicly reachable URL with its last modification time.
 * Locale variants are expanded by the web app, which owns the URL structure.
 */
export interface SitemapEntry {
  path: string;
  lastModified: string;
  changeFrequency: 'daily' | 'weekly' | 'monthly';
  priority: number;
}

export async function buildSitemapEntries(): Promise<SitemapEntry[]> {
  const [pages, courses, categories, posts, products] = await Promise.all([
    prisma.page.findMany({
      where: { status: 'PUBLISHED', isEnabled: true, deletedAt: null },
      select: { slug: true, updatedAt: true },
    }),
    prisma.course.findMany({
      where: { status: 'PUBLISHED', deletedAt: null },
      select: { slug: true, updatedAt: true },
    }),
    prisma.category.findMany({
      where: { isActive: true },
      select: { slug: true, updatedAt: true },
    }),
    prisma.blogPost.findMany({
      where: { status: 'PUBLISHED', deletedAt: null },
      select: { slug: true, updatedAt: true },
    }),
    prisma.product.findMany({
      where: { isActive: true, deletedAt: null },
      select: { slug: true, updatedAt: true },
    }),
  ]);

  const entries: SitemapEntry[] = [
    { path: '/', lastModified: new Date().toISOString(), changeFrequency: 'daily', priority: 1 },
    { path: '/courses', lastModified: new Date().toISOString(), changeFrequency: 'daily', priority: 0.9 },
    { path: '/categories', lastModified: new Date().toISOString(), changeFrequency: 'weekly', priority: 0.7 },
  ];

  for (const page of pages) {
    // The home page is emitted above under `/`; skip its slug form.
    if (page.slug === 'home') continue;
    entries.push({
      path: `/${page.slug}`,
      lastModified: page.updatedAt.toISOString(),
      changeFrequency: 'monthly',
      priority: 0.6,
    });
  }
  for (const course of courses) {
    entries.push({
      path: `/courses/${course.slug}`,
      lastModified: course.updatedAt.toISOString(),
      changeFrequency: 'weekly',
      priority: 0.8,
    });
  }
  for (const category of categories) {
    entries.push({
      path: `/categories/${category.slug}`,
      lastModified: category.updatedAt.toISOString(),
      changeFrequency: 'weekly',
      priority: 0.6,
    });
  }
  for (const post of posts) {
    entries.push({
      path: `/blog/${post.slug}`,
      lastModified: post.updatedAt.toISOString(),
      changeFrequency: 'monthly',
      priority: 0.6,
    });
  }
  for (const product of products) {
    entries.push({
      path: `/shop/${product.slug}`,
      lastModified: product.updatedAt.toISOString(),
      changeFrequency: 'weekly',
      priority: 0.5,
    });
  }

  return entries;
}
