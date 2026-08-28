import 'server-only';
import type { CollectionIndexDto, PageDto } from '@academy/types';
import {
  getBlogPosts,
  getCategories,
  getCollection,
  getFeaturedCourses,
  getInstructors,
} from './queries';
import { EMPTY_SECTION_DATA, type SectionData } from '@/components/sections/registry';

/**
 * Resolves the catalogue data a CMS page's sections need.
 *
 * Only what the page actually contains is fetched: a page with no course grid
 * never queries courses. Everything else runs in parallel, so the slowest
 * dependency sets the page's latency rather than their sum.
 */
export async function resolveSectionData(page: PageDto, locale: string): Promise<SectionData> {
  const types = new Set(page.sections.map((section) => section.type));

  const needsCourses = types.has('COURSE_GRID');
  const needsCategories = types.has('CATEGORY_GRID');
  const needsInstructors = types.has('INSTRUCTOR_LIST') || types.has('TEAM');
  const needsPosts = types.has('BLOG_GRID');

  // Each collection grid names the collection it shows, so the slugs are read
  // from the sections rather than derived from the type alone.
  const collectionSlugs = [
    ...new Set(
      page.sections
        .filter((section) => section.type === 'COLLECTION_GRID')
        .map((section) => section.content.collectionSlug)
        .filter((slug): slug is string => typeof slug === 'string' && slug.length > 0),
    ),
  ];

  if (
    !needsCourses &&
    !needsCategories &&
    !needsInstructors &&
    !needsPosts &&
    collectionSlugs.length === 0
  ) {
    return EMPTY_SECTION_DATA;
  }

  // Section settings can raise the limit, so fetch the largest requested.
  const courseLimit = page.sections
    .filter((section) => section.type === 'COURSE_GRID')
    .reduce((max, section) => {
      const limit = section.settings.limit;
      return Math.max(max, typeof limit === 'number' ? limit : 6);
    }, 6);

  const [featuredCourses, categories, instructors, posts, collectionList] = await Promise.all([
    needsCourses ? getFeaturedCourses(locale, courseLimit) : Promise.resolve([]),
    needsCategories ? getCategories(locale) : Promise.resolve([]),
    needsInstructors ? getInstructors(locale) : Promise.resolve([]),
    needsPosts ? getBlogPosts(locale, { pageSize: 6 }) : Promise.resolve({ items: [], meta: undefined }),
    Promise.all(collectionSlugs.map((slug) => getCollection(slug, locale))),
  ]);

  const collections: Record<string, CollectionIndexDto> = {};
  for (const index of collectionList) {
    // A slug that no longer resolves is simply absent; the section renders
    // nothing rather than the page failing.
    if (index) collections[index.collection.slug] = index;
  }

  return {
    featuredCourses,
    // Category grids show top-level tracks, not every subcategory.
    categories: categories.flatMap((category) => [category]),
    instructors,
    latestPosts: posts.items.map((post) => ({
      id: post.id,
      slug: post.slug,
      title: post.title,
      excerpt: post.excerpt,
      coverImageUrl: post.coverImageUrl,
      publishedAt: post.publishedAt,
      readingMinutes: post.readingMinutes,
    })),
    collections,
  };
}
