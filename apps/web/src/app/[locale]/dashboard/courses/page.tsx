import type { Metadata } from 'next';
import Link from 'next/link';
import { BookOpen } from 'lucide-react';
import { getMyEnrollments } from '@/lib/api/queries';
import { localePath } from '@/lib/i18n/config';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/components/ui';
import { Pagination } from '@/components/ui/pagination';
import { CourseCard } from '@/components/courses/course-card';

export const metadata: Metadata = {
  title: 'My courses',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'in-progress', label: 'In progress' },
  { value: 'not-started', label: 'Not started' },
  { value: 'completed', label: 'Completed' },
];

export default async function MyCoursesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ filter?: string; page?: string }>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);

  const filter = FILTERS.some((entry) => entry.value === query.filter)
    ? (query.filter as string)
    : 'all';
  const page = Math.max(1, Number.parseInt(query.page ?? '1', 10) || 1);

  const { items, meta } = await getMyEnrollments(locale, { page, pageSize: 12, filter });

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary">My courses</h1>
        <p className="text-text-secondary">Everything you are enrolled in, with live progress.</p>
      </header>

      <nav aria-label="Filter courses">
        <ul className="flex flex-wrap gap-2">
          {FILTERS.map((entry) => {
            const isActive = entry.value === filter;
            const href =
              entry.value === 'all'
                ? localePath(locale, '/dashboard/courses')
                : localePath(locale, `/dashboard/courses?filter=${entry.value}`);

            return (
              <li key={entry.value}>
                <Link
                  href={href}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'inline-flex rounded-full border px-3.5 py-1.5 text-sm transition-colors',
                    isActive
                      ? 'border-primary bg-primary text-text-on-primary'
                      : 'border-border text-text-secondary hover:border-primary hover:text-primary',
                  )}
                >
                  {entry.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {items.length > 0 ? (
        <>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((enrollment) => (
              <CourseCard
                key={enrollment.id}
                course={enrollment.course}
                locale={locale}
                progressPercent={enrollment.progress.progressPercent}
              />
            ))}
          </div>

          {meta && meta.totalPages > 1 ? (
            <Pagination
              meta={meta}
              basePath={localePath(locale, '/dashboard/courses')}
              searchParams={{ filter: filter === 'all' ? undefined : filter }}
            />
          ) : null}
        </>
      ) : (
        <EmptyState
          icon={<BookOpen className="size-8" />}
          title={
            filter === 'all'
              ? 'You have not enrolled in a course yet.'
              : 'No courses match this filter.'
          }
          description={
            filter === 'all'
              ? 'Browse the catalogue to find your first course.'
              : 'Try a different filter, or enroll in something new.'
          }
          action={
            <Link
              href={localePath(locale, '/courses')}
              className="text-sm font-medium text-primary hover:underline"
            >
              Browse courses
            </Link>
          }
        />
      )}
    </div>
  );
}
