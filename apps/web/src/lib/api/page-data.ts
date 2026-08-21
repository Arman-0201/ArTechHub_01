import 'server-only';
import type { PageDto } from '@academy/types';
import { getBlogPosts, getCategories, getFeaturedCourses, getInstructors } from './queries';
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

  if (!needsCourses && !needsCategories && !needsInstructors && !needsPosts) {
    return EMPTY_SECTION_DATA;
  }

  // Section settings can raise the limit, so fetch the largest requested.
  const courseLimit = page.sections
    .filter((section) => section.type === 'COURSE_GRID')
    .reduce((max, section) => {
      const limit = section.settings.limit;
      return Math.max(max, typeof limit === 'number' ? limit : 6);
    }, 6);

  const [featuredCourses, categories, instructors, posts] = await Promise.all([
    needsCourses ? getFeaturedCourses(locale, courseLimit) : Promise.resolve([]),
    needsCategories ? getCategories(locale) : Promise.resolve([]),
    needsInstructors ? getInstructors(locale) : Promise.resolve([]),
    needsPosts ? getBlogPosts(locale, { pageSize: 6 }) : Promise.resolve({ items: [], meta: undefined }),
  ]);

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
  };
}
