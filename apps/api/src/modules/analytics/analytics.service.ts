import { FEATURE_KEYS, type AdminOverviewDto } from '@academy/types';
import { prisma } from '../../lib/prisma.js';
import { isFeatureEnabled } from '../feature-flags/feature-flags.service.js';
import { listAuditLogs } from '../audit/audit.service.js';

/**
 * Admin dashboard metrics.
 *
 * Every number is a server-side aggregate — counts and grouped queries, never
 * "fetch all rows and count in JavaScript". The trend series is one grouped
 * query bucketed in memory, which is cheap because the window is bounded to 30
 * days.
 */

function daysAgo(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(0, 0, 0, 0);
  return date;
}

export async function getAdminOverview(): Promise<AdminOverviewDto> {
  const thirtyDaysAgo = daysAgo(30);
  const shopEnabled = await isFeatureEnabled(FEATURE_KEYS.SHOP);

  const [
    totalUsers,
    newUsers,
    activeUsers,
    totalCourses,
    publishedCourses,
    draftCourses,
    archivedCourses,
    totalEnrollments,
    recentEnrollments,
    completions,
    pages,
    blogPosts,
    mediaCount,
  ] = await Promise.all([
    prisma.user.count({ where: { deletedAt: null } }),
    prisma.user.count({ where: { deletedAt: null, createdAt: { gte: thirtyDaysAgo } } }),
    prisma.user.count({ where: { deletedAt: null, lastActiveAt: { gte: thirtyDaysAgo } } }),
    prisma.course.count({ where: { deletedAt: null } }),
    prisma.course.count({ where: { deletedAt: null, status: 'PUBLISHED' } }),
    prisma.course.count({ where: { deletedAt: null, status: 'DRAFT' } }),
    prisma.course.count({ where: { deletedAt: null, status: 'ARCHIVED' } }),
    prisma.enrollment.count(),
    prisma.enrollment.count({ where: { enrolledAt: { gte: thirtyDaysAgo } } }),
    prisma.enrollment.count({ where: { status: 'COMPLETED' } }),
    prisma.page.count({ where: { deletedAt: null } }),
    prisma.blogPost.count({ where: { deletedAt: null } }),
    prisma.media.count(),
  ]);

  const enrollmentRows = await prisma.enrollment.findMany({
    where: { enrolledAt: { gte: thirtyDaysAgo } },
    select: { enrolledAt: true },
  });

  // Pre-fill every day so the chart has no gaps where nothing happened.
  const trendBuckets = new Map<string, number>();
  for (let offset = 29; offset >= 0; offset -= 1) {
    trendBuckets.set(daysAgo(offset).toISOString().slice(0, 10), 0);
  }
  for (const row of enrollmentRows) {
    const key = row.enrolledAt.toISOString().slice(0, 10);
    if (trendBuckets.has(key)) trendBuckets.set(key, (trendBuckets.get(key) ?? 0) + 1);
  }

  const topCourses = await prisma.course.findMany({
    where: { deletedAt: null, status: 'PUBLISHED' },
    orderBy: { enrollmentCount: 'desc' },
    take: 5,
    select: { id: true, title: true, slug: true, enrollmentCount: true },
  });

  let commerce: AdminOverviewDto['commerce'] = null;
  if (shopEnabled) {
    const [products, orders, revenue] = await Promise.all([
      prisma.product.count({ where: { deletedAt: null } }),
      prisma.order.count(),
      prisma.order.aggregate({
        where: { status: { in: ['PAID', 'FULFILLED'] } },
        _sum: { totalCents: true },
      }),
    ]);
    commerce = { products, orders, revenueCents: revenue._sum.totalCents ?? 0 };
  }

  const recentActivity = await listAuditLogs({ page: 1, pageSize: 8 });

  return {
    users: { total: totalUsers, newLast30Days: newUsers, activeLast30Days: activeUsers },
    courses: {
      total: totalCourses,
      published: publishedCourses,
      draft: draftCourses,
      archived: archivedCourses,
    },
    enrollments: { total: totalEnrollments, last30Days: recentEnrollments, completions },
    content: { pages, blogPosts, media: mediaCount },
    commerce,
    enrollmentTrend: [...trendBuckets.entries()].map(([date, count]) => ({ date, count })),
    topCourses: topCourses.map((course) => ({
      id: course.id,
      title: course.title,
      slug: course.slug,
      enrollments: course.enrollmentCount,
    })),
    recentActivity: recentActivity.items,
  };
}

/** Per-course analytics for the course detail screen in the admin panel. */
export async function getCourseAnalytics(courseId: string) {
  const [enrollments, completions, averageProgress, lessonStats] = await Promise.all([
    prisma.enrollment.count({ where: { courseId } }),
    prisma.enrollment.count({ where: { courseId, status: 'COMPLETED' } }),
    prisma.courseProgress.aggregate({ where: { courseId }, _avg: { progressPercent: true } }),
    prisma.lessonProgress.groupBy({
      by: ['lessonId'],
      where: { courseId, isCompleted: true },
      _count: { lessonId: true },
    }),
  ]);

  const lessons = await prisma.lesson.findMany({
    where: { module: { courseId } },
    orderBy: [{ module: { sortOrder: 'asc' } }, { sortOrder: 'asc' }],
    select: { id: true, title: true },
  });

  const completionsByLesson = new Map(
    lessonStats.map((stat) => [stat.lessonId, stat._count.lessonId]),
  );

  return {
    enrollments,
    completions,
    completionRate: enrollments > 0 ? Math.round((completions / enrollments) * 100) : 0,
    averageProgressPercent: Math.round(averageProgress._avg.progressPercent ?? 0),
    lessons: lessons.map((lesson) => ({
      id: lesson.id,
      title: lesson.title,
      completions: completionsByLesson.get(lesson.id) ?? 0,
      // Where learners stop is the most actionable signal in the whole panel.
      completionRate:
        enrollments > 0
          ? Math.round(((completionsByLesson.get(lesson.id) ?? 0) / enrollments) * 100)
          : 0,
    })),
  };
}
