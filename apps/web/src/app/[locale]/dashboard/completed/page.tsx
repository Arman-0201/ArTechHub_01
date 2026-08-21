import type { Metadata } from 'next';
import Link from 'next/link';
import { Award } from 'lucide-react';
import { getMyEnrollments } from '@/lib/api/queries';
import { localePath } from '@/lib/i18n/config';
import { formatDate } from '@/lib/utils';
import { Badge, Card, EmptyState } from '@/components/ui';
import { Pagination } from '@/components/ui/pagination';

export const metadata: Metadata = {
  title: 'Completed courses',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function CompletedCoursesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  const page = Math.max(1, Number.parseInt(query.page ?? '1', 10) || 1);

  const { items, meta } = await getMyEnrollments(locale, {
    page,
    pageSize: 12,
    filter: 'completed',
  });

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary">Completed</h1>
        <p className="text-text-secondary">Courses you have finished, with the date you did it.</p>
      </header>

      {items.length > 0 ? (
        <>
          <ul className="space-y-3">
            {items.map((enrollment) => (
              <li key={enrollment.id}>
                <Card className="p-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                    <span
                      className="grid size-11 shrink-0 place-items-center rounded-lg bg-success-soft text-success"
                      aria-hidden="true"
                    >
                      <Award className="size-5" />
                    </span>

                    <div className="min-w-0 flex-1">
                      <h2 className="truncate font-semibold text-text-primary">
                        <Link
                          href={localePath(locale, `/courses/${enrollment.course.slug}`)}
                          className="transition-colors hover:text-primary"
                        >
                          {enrollment.course.title}
                        </Link>
                      </h2>
                      <p className="text-sm text-text-muted">
                        {enrollment.progress.totalLessons} lessons
                        {enrollment.progress.completedAt
                          ? ` · finished ${formatDate(enrollment.progress.completedAt, locale)}`
                          : null}
                      </p>
                    </div>

                    <Badge tone="success" className="shrink-0">
                      100% complete
                    </Badge>
                  </div>
                </Card>
              </li>
            ))}
          </ul>

          {meta && meta.totalPages > 1 ? (
            <Pagination meta={meta} basePath={localePath(locale, '/dashboard/completed')} />
          ) : null}
        </>
      ) : (
        <EmptyState
          icon={<Award className="size-8" />}
          title="No completed courses yet."
          description="Finish every lesson in a course and it will appear here."
          action={
            <Link
              href={localePath(locale, '/dashboard/courses')}
              className="text-sm font-medium text-primary hover:underline"
            >
              See courses in progress
            </Link>
          }
        />
      )}
    </div>
  );
}
