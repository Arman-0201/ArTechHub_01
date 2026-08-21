import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, BookOpen, CheckCircle2, Clock, Flame, GraduationCap, Target } from 'lucide-react';
import { getDashboard, getSessionUser } from '@/lib/api/queries';
import { localePath } from '@/lib/i18n/config';
import { formatNumber } from '@/lib/utils';
import { Button, Card, EmptyState, ProgressBar, SectionHeading } from '@/components/ui';
import { CourseCard } from '@/components/courses/course-card';

export const metadata: Metadata = {
  title: 'Dashboard',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

function StatTile({
  label,
  value,
  Icon,
  accent,
}: {
  label: string;
  value: string;
  Icon: typeof BookOpen;
  accent?: boolean;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-text-muted">{label}</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-text-primary">{value}</p>
        </div>
        <span
          className={
            accent
              ? 'grid size-9 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary'
              : 'grid size-9 shrink-0 place-items-center rounded-lg bg-surface-sunken text-text-muted'
          }
          aria-hidden="true"
        >
          <Icon className="size-4.5" />
        </span>
      </div>
    </Card>
  );
}

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  // The layout has already established there is a session; this is for the name.
  const [user, dashboard] = await Promise.all([getSessionUser(), getDashboard(locale)]);
  const { stats, continueLearning, recentCourses } = dashboard;

  const firstName = user?.name.split(' ')[0] ?? 'there';

  return (
    <div className="space-y-10">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
          Welcome back, {firstName}
        </h1>
        <p className="text-text-secondary">
          {stats.totalCourses === 0
            ? 'Enroll in your first course to start tracking progress.'
            : `You have completed ${stats.lessonsCompleted} of ${stats.totalLessons} lessons across your courses.`}
        </p>
      </header>

      <section aria-labelledby="stats-heading">
        <h2 id="stats-heading" className="sr-only">
          Learning statistics
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="Overall progress"
            value={`${stats.overallProgressPercent}%`}
            Icon={Target}
            accent
          />
          <StatTile label="In progress" value={formatNumber(stats.inProgress, locale)} Icon={BookOpen} />
          <StatTile
            label="Completed"
            value={formatNumber(stats.completed, locale)}
            Icon={CheckCircle2}
          />
          <StatTile
            label="Day streak"
            value={formatNumber(stats.currentStreakDays, locale)}
            Icon={Flame}
          />
        </div>

        <Card className="mt-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
              <span className="text-text-secondary">
                <span className="font-semibold text-text-primary">
                  {formatNumber(stats.totalCourses, locale)}
                </span>{' '}
                enrolled
              </span>
              <span className="text-text-secondary">
                <span className="font-semibold text-text-primary">
                  {formatNumber(stats.notStarted, locale)}
                </span>{' '}
                not started
              </span>
              <span className="inline-flex items-center gap-1.5 text-text-secondary">
                <Clock className="size-4 text-text-muted" aria-hidden="true" />
                <span className="font-semibold text-text-primary">
                  {formatNumber(stats.minutesLearned, locale)}
                </span>{' '}
                minutes learned
              </span>
            </div>
            <div className="min-w-48 flex-1">
              <ProgressBar
                value={stats.overallProgressPercent}
                label={`Overall progress: ${stats.overallProgressPercent}%`}
              />
            </div>
          </div>
        </Card>
      </section>

      {continueLearning.length > 0 ? (
        <section aria-labelledby="continue-heading">
          <SectionHeading
            title="Continue learning"
            description="Pick up exactly where you stopped."
            className="mb-5"
          />
          <div className="space-y-3">
            {continueLearning.map((enrollment) => {
              const resumeHref = enrollment.progress.lastLessonId
                ? localePath(locale, `/courses/${enrollment.course.slug}`)
                : localePath(locale, `/courses/${enrollment.course.slug}`);

              return (
                <Card key={enrollment.id} className="overflow-hidden">
                  <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
                    <div className="aspect-[16/9] w-full shrink-0 overflow-hidden rounded-lg bg-surface-sunken sm:aspect-square sm:size-20">
                      {enrollment.course.thumbnailUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={enrollment.course.thumbnailUrl}
                          alt=""
                          className="size-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <span className="grid size-full place-items-center" aria-hidden="true">
                          <GraduationCap className="size-6 text-text-muted" />
                        </span>
                      )}
                    </div>

                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="min-w-0">
                        <h3 className="truncate font-semibold text-text-primary">
                          {enrollment.course.title}
                        </h3>
                        <p className="text-sm text-text-muted">
                          {enrollment.progress.completedLessons} of{' '}
                          {enrollment.progress.totalLessons} lessons
                        </p>
                      </div>
                      <ProgressBar value={enrollment.progress.progressPercent} size="sm" />
                    </div>

                    <Button href={resumeHref} className="shrink-0">
                      Continue
                      <ArrowRight className="size-4" aria-hidden="true" />
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        </section>
      ) : null}

      <section aria-labelledby="courses-heading">
        <SectionHeading
          title="Your courses"
          action={
            recentCourses.length > 0 ? (
              <Button href={localePath(locale, '/dashboard/courses')} variant="outline" size="sm">
                View all
              </Button>
            ) : undefined
          }
          className="mb-5"
        />

        {recentCourses.length > 0 ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {recentCourses.map((enrollment) => (
              <CourseCard
                key={enrollment.id}
                course={enrollment.course}
                locale={locale}
                progressPercent={enrollment.progress.progressPercent}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<BookOpen className="size-8" />}
            title="You have not enrolled in a course yet."
            description="Browse the catalogue to find your first course — most are free."
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
      </section>
    </div>
  );
}
