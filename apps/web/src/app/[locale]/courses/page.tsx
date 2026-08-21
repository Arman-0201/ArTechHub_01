import type { Metadata } from 'next';
import Link from 'next/link';
import { BookOpen } from 'lucide-react';
import { getCategories, getCourses } from '@/lib/api/queries';
import { buildPageMetadata } from '@/lib/seo';
import { CourseCardGrid } from '@/components/courses/course-card';
import { CourseFilters } from '@/components/courses/course-filters';
import { Pagination } from '@/components/ui/pagination';
import { EmptyState } from '@/components/ui';
import { localePath } from '@/lib/i18n/config';

/**
 * Course catalogue.
 *
 * Filtering, sorting and pagination all happen on the server — the URL is the
 * source of truth, which makes every view linkable, shareable and indexable,
 * and means the browser never receives more courses than it displays.
 */

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildPageMetadata({
    seo: null,
    locale,
    path: '/courses',
    fallbackTitle: 'Courses',
    fallbackDescription:
      'Browse structured courses in networking, development, cloud and security.',
  });
}

interface SearchParams {
  page?: string;
  search?: string;
  category?: string;
  level?: string;
  tag?: string;
  sort?: string;
}

export default async function CoursesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);

  const page = Math.max(1, Number.parseInt(query.page ?? '1', 10) || 1);

  const [{ items, meta }, categories] = await Promise.all([
    getCourses(locale, {
      page,
      pageSize: 12,
      search: query.search,
      category: query.category,
      level: query.level,
      tag: query.tag,
      sort: query.sort === 'popular' ? 'enrollmentCount' : query.sort === 'title' ? 'title' : 'publishedAt',
      order: query.sort === 'title' ? 'asc' : 'desc',
    }),
    getCategories(locale),
  ]);

  // Subcategories are flattened into the filter list so a learner can pick a
  // specific track without drilling into it first.
  const filterCategories = categories.flatMap((category) => [
    category,
    ...(category.children ?? []),
  ]);

  return (
    <>
      <section className="border-b border-border bg-background-subtle py-12 sm:py-16">
        <div className="container-page">
          <div className="max-w-2xl space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
              Catalogue
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-text-primary sm:text-4xl">
              Every course, in one place
            </h1>
            <p className="text-lg leading-relaxed text-text-secondary">
              Structured tracks with real examples, progress tracking and no filler. Filter by
              track, level or keyword to find where to start.
            </p>
          </div>
        </div>
      </section>

      <section className="py-10 sm:py-12">
        <div className="container-page space-y-8">
          <CourseFilters categories={filterCategories} locale={locale} />

          {meta ? (
            <p className="text-sm text-text-muted" aria-live="polite">
              {meta.total} {meta.total === 1 ? 'course' : 'courses'}
            </p>
          ) : null}

          {items.length > 0 ? (
            <>
              <CourseCardGrid courses={items} locale={locale} columns={3} />
              {meta && meta.totalPages > 1 ? (
                <Pagination
                  meta={meta}
                  basePath={localePath(locale, '/courses')}
                  searchParams={query as Record<string, string | undefined>}
                />
              ) : null}
            </>
          ) : (
            <EmptyState
              icon={<BookOpen className="size-8" />}
              title="No courses match your filters yet."
              description="Try widening your search or clearing a filter."
              action={
                <Link
                  href={localePath(locale, '/courses')}
                  className="text-sm font-medium text-primary hover:underline"
                >
                  Clear all filters
                </Link>
              }
            />
          )}
        </div>
      </section>
    </>
  );
}
