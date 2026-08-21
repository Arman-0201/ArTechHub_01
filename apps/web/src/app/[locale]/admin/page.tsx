import type { Metadata } from 'next';
import Link from 'next/link';
import {
  BookOpen,
  FileText,
  GraduationCap,
  ImageIcon,
  ShoppingCart,
  TrendingUp,
  Users,
} from 'lucide-react';
import type { AdminOverviewDto } from '@academy/types';
import { serverFetch } from '@/lib/api/server';
import { ApiError } from '@/lib/api/types';
import { localePath } from '@/lib/i18n/config';
import { formatDate, formatNumber, formatPrice } from '@/lib/utils';
import { Alert, Badge, Card } from '@/components/ui';
import { AdminPageHeader, StatCard } from '@/components/admin/primitives';
import { EnrollmentTrendChart } from '@/components/admin/enrollment-trend-chart';

export const metadata: Metadata = {
  title: 'Admin dashboard',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function AdminDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  let overview: AdminOverviewDto | null = null;
  let permissionDenied = false;

  try {
    overview = await serverFetch<AdminOverviewDto>('/admin/overview', { locale });
  } catch (error) {
    // A staff member without analytics permission can still reach the panel;
    // this screen simply has nothing to show them.
    if (error instanceof ApiError && error.isForbidden) permissionDenied = true;
    else throw error;
  }

  if (permissionDenied || !overview) {
    return (
      <>
        <AdminPageHeader title="Admin dashboard" />
        <Alert tone="info" title="No dashboard access">
          Your role does not include analytics access. Use the navigation to reach the areas you
          can manage.
        </Alert>
      </>
    );
  }

  return (
    <>
      <AdminPageHeader
        title="Dashboard"
        description="How the platform is being used, at a glance."
      />

      <div className="space-y-8">
        <section aria-labelledby="key-metrics">
          <h2 id="key-metrics" className="sr-only">
            Key metrics
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Total users"
              value={formatNumber(overview.users.total, locale)}
              hint={`${formatNumber(overview.users.newLast30Days, locale)} new in 30 days`}
              icon={<Users className="size-4.5" />}
            />
            <StatCard
              label="Published courses"
              value={formatNumber(overview.courses.published, locale)}
              hint={`${formatNumber(overview.courses.draft, locale)} in draft`}
              icon={<BookOpen className="size-4.5" />}
            />
            <StatCard
              label="Enrollments"
              value={formatNumber(overview.enrollments.total, locale)}
              hint={`${formatNumber(overview.enrollments.last30Days, locale)} in 30 days`}
              icon={<GraduationCap className="size-4.5" />}
            />
            <StatCard
              label="Completions"
              value={formatNumber(overview.enrollments.completions, locale)}
              hint={
                overview.enrollments.total > 0
                  ? `${Math.round((overview.enrollments.completions / overview.enrollments.total) * 100)}% completion rate`
                  : undefined
              }
              icon={<TrendingUp className="size-4.5" />}
            />
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Card>
            <div className="p-5">
              <h2 className="text-base font-semibold text-text-primary">
                Enrollments, last 30 days
              </h2>
              <p className="text-sm text-text-muted">
                {formatNumber(overview.enrollments.last30Days, locale)} total in the period
              </p>
              <EnrollmentTrendChart data={overview.enrollmentTrend} locale={locale} />
            </div>
          </Card>

          <Card>
            <div className="p-5">
              <h2 className="text-base font-semibold text-text-primary">Most enrolled</h2>
              {overview.topCourses.length > 0 ? (
                <ol className="mt-4 space-y-3">
                  {overview.topCourses.map((course, index) => (
                    <li key={course.id} className="flex items-center gap-3">
                      <span
                        className="grid size-6 shrink-0 place-items-center rounded-md bg-surface-sunken text-xs font-semibold text-text-muted"
                        aria-hidden="true"
                      >
                        {index + 1}
                      </span>
                      <Link
                        href={localePath(locale, `/admin/courses/${course.id}`)}
                        className="min-w-0 flex-1 truncate text-sm text-text-secondary transition-colors hover:text-primary"
                      >
                        {course.title}
                      </Link>
                      <span className="shrink-0 text-sm font-semibold text-text-primary">
                        {formatNumber(course.enrollments, locale)}
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="mt-4 text-sm text-text-muted">No enrollments yet.</p>
              )}
            </div>
          </Card>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="CMS pages"
            value={formatNumber(overview.content.pages, locale)}
            icon={<FileText className="size-4.5" />}
          />
          <StatCard
            label="Articles"
            value={formatNumber(overview.content.blogPosts, locale)}
            icon={<FileText className="size-4.5" />}
          />
          <StatCard
            label="Media files"
            value={formatNumber(overview.content.media, locale)}
            icon={<ImageIcon className="size-4.5" />}
          />
          {overview.commerce ? (
            <StatCard
              label="Revenue"
              value={formatPrice(overview.commerce.revenueCents, 'USD', locale)}
              hint={`${formatNumber(overview.commerce.orders, locale)} orders`}
              icon={<ShoppingCart className="size-4.5" />}
            />
          ) : (
            <StatCard
              label="Active users"
              value={formatNumber(overview.users.activeLast30Days, locale)}
              hint="in the last 30 days"
              icon={<Users className="size-4.5" />}
            />
          )}
        </div>

        <Card>
          <div className="p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-text-primary">Recent activity</h2>
              <Link
                href={localePath(locale, '/admin/audit-logs')}
                className="text-sm font-medium text-primary hover:underline"
              >
                View audit log
              </Link>
            </div>

            {overview.recentActivity.length > 0 ? (
              <ul className="mt-4 divide-y divide-border">
                {overview.recentActivity.map((entry) => (
                  <li key={entry.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                    <Badge tone="neutral" className="font-mono text-2xs">
                      {entry.action}
                    </Badge>
                    <span className="min-w-0 flex-1 truncate text-sm text-text-secondary">
                      {entry.actor?.name ?? 'System'}
                      {entry.targetType ? ` · ${entry.targetType}` : ''}
                    </span>
                    <time
                      dateTime={entry.createdAt}
                      className="shrink-0 text-xs text-text-muted"
                    >
                      {formatDate(entry.createdAt, locale)}
                    </time>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-text-muted">No recorded activity yet.</p>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
