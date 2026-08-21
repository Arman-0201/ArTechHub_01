import { prisma } from '../../lib/prisma.js';
import { buildPaginationMeta, toSkipTake } from '../../lib/http.js';
import { resolveMediaUrl } from '../media/media.helpers.js';

/**
 * Site search.
 *
 * Deliberately a database query with `ILIKE` rather than a dedicated engine:
 * it is correct, needs no extra infrastructure, and is fast enough at this
 * scale with the indexes in place. The single entry point below is the seam —
 * swapping in Meilisearch or Postgres full-text search later means rewriting
 * this file and nothing else.
 *
 * The important property, whichever backend is used: filtering happens on the
 * server. The browser never receives rows it is not allowed to see.
 */

export type SearchScope = 'all' | 'courses' | 'categories' | 'blog' | 'products';

export interface SearchResultItem {
  type: 'course' | 'category' | 'article' | 'product';
  id: string;
  slug: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  url: string;
  meta?: Record<string, unknown>;
}

export interface SearchInput {
  query: string;
  scope: SearchScope;
  page: number;
  pageSize: number;
  shopEnabled: boolean;
  blogEnabled: boolean;
}

export async function search(input: SearchInput) {
  const term = input.query.trim();
  const contains = { contains: term, mode: 'insensitive' as const };

  // Feature flags are honoured here too, so a disabled section cannot be
  // reached through the search endpoint.
  const wants = (scope: SearchScope) => input.scope === 'all' || input.scope === scope;
  const searchBlog = wants('blog') && input.blogEnabled;
  const searchShop = wants('products') && input.shopEnabled;

  const [courses, categories, posts, products] = await Promise.all([
    wants('courses')
      ? prisma.course.findMany({
          where: {
            status: 'PUBLISHED',
            deletedAt: null,
            OR: [{ title: contains }, { summary: contains }, { tags: { some: { tag: { name: contains } } } }],
          },
          take: 50,
          orderBy: { enrollmentCount: 'desc' },
          select: {
            id: true,
            slug: true,
            title: true,
            summary: true,
            level: true,
            lessonCount: true,
            thumbnail: { select: { url: true, storageKey: true, storageDriver: true } },
          },
        })
      : Promise.resolve([]),
    wants('categories')
      ? prisma.category.findMany({
          where: { isActive: true, OR: [{ name: contains }, { description: contains }] },
          take: 20,
          select: {
            id: true,
            slug: true,
            name: true,
            description: true,
            image: { select: { url: true, storageKey: true, storageDriver: true } },
            _count: { select: { courses: true } },
          },
        })
      : Promise.resolve([]),
    searchBlog
      ? prisma.blogPost.findMany({
          where: {
            status: 'PUBLISHED',
            deletedAt: null,
            OR: [{ title: contains }, { excerpt: contains }],
          },
          take: 30,
          orderBy: { publishedAt: 'desc' },
          select: {
            id: true,
            slug: true,
            title: true,
            excerpt: true,
            readingMinutes: true,
            cover: { select: { url: true, storageKey: true, storageDriver: true } },
          },
        })
      : Promise.resolve([]),
    searchShop
      ? prisma.product.findMany({
          where: {
            isActive: true,
            deletedAt: null,
            OR: [{ name: contains }, { summary: contains }],
          },
          take: 30,
          select: {
            id: true,
            slug: true,
            name: true,
            summary: true,
            priceCents: true,
            currency: true,
            images: {
              take: 1,
              orderBy: { sortOrder: 'asc' },
              select: { media: { select: { url: true, storageKey: true, storageDriver: true } } },
            },
          },
        })
      : Promise.resolve([]),
  ]);

  const results: SearchResultItem[] = [
    ...courses.map((course) => ({
      type: 'course' as const,
      id: course.id,
      slug: course.slug,
      title: course.title,
      description: course.summary,
      imageUrl: course.thumbnail ? resolveMediaUrl(course.thumbnail) : null,
      url: `/courses/${course.slug}`,
      meta: { level: course.level, lessonCount: course.lessonCount },
    })),
    ...categories.map((category) => ({
      type: 'category' as const,
      id: category.id,
      slug: category.slug,
      title: category.name,
      description: category.description,
      imageUrl: category.image ? resolveMediaUrl(category.image) : null,
      url: `/categories/${category.slug}`,
      meta: { courseCount: category._count.courses },
    })),
    ...posts.map((post) => ({
      type: 'article' as const,
      id: post.id,
      slug: post.slug,
      title: post.title,
      description: post.excerpt,
      imageUrl: post.cover ? resolveMediaUrl(post.cover) : null,
      url: `/blog/${post.slug}`,
      meta: { readingMinutes: post.readingMinutes },
    })),
    ...products.map((product) => ({
      type: 'product' as const,
      id: product.id,
      slug: product.slug,
      title: product.name,
      description: product.summary,
      imageUrl: product.images[0] ? resolveMediaUrl(product.images[0].media) : null,
      url: `/shop/${product.slug}`,
      meta: { priceCents: product.priceCents, currency: product.currency },
    })),
  ];

  // Exact and prefix matches first — a search for "react" should surface the
  // React course before an article that merely mentions it.
  const lowerTerm = term.toLowerCase();
  results.sort((a, b) => {
    const score = (item: SearchResultItem) => {
      const title = item.title.toLowerCase();
      if (title === lowerTerm) return 0;
      if (title.startsWith(lowerTerm)) return 1;
      if (title.includes(lowerTerm)) return 2;
      return 3;
    };
    return score(a) - score(b);
  });

  const { skip, take } = toSkipTake(input.page, input.pageSize);

  return {
    items: results.slice(skip, skip + take),
    meta: buildPaginationMeta(results.length, input.page, input.pageSize),
    counts: {
      courses: courses.length,
      categories: categories.length,
      articles: posts.length,
      products: products.length,
    },
  };
}

/** Lightweight typeahead for the header search box. */
export async function suggest(term: string, limit = 6): Promise<SearchResultItem[]> {
  if (term.trim().length < 2) return [];

  const courses = await prisma.course.findMany({
    where: {
      status: 'PUBLISHED',
      deletedAt: null,
      title: { contains: term.trim(), mode: 'insensitive' },
    },
    take: limit,
    orderBy: { enrollmentCount: 'desc' },
    select: { id: true, slug: true, title: true, summary: true },
  });

  return courses.map((course) => ({
    type: 'course' as const,
    id: course.id,
    slug: course.slug,
    title: course.title,
    description: course.summary,
    imageUrl: null,
    url: `/courses/${course.slug}`,
  }));
}
