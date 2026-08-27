import type { Prisma } from '@prisma/client';
import type { CourseCardDto, EnrollmentDto, PaginatedResult } from '@academy/types';
import { prisma } from '../../lib/prisma.js';
import { AuthorizationError, BadRequestError, ConflictError, NotFoundError } from '../../lib/errors.js';
import { buildPaginationMeta, toSkipTake } from '../../lib/http.js';
import { resolveMediaUrl } from '../media/media.helpers.js';
import { applyTranslation, pickTranslation } from '../translations/translation.helpers.js';
import { announceLearnerChange } from '../../realtime/events.js';

/**
 * Enrollment is where course access is granted, so the access-type rules live
 * here rather than being implied by the UI:
 *
 *   FREE        — any verified, signed-in learner may self-enroll.
 *   PAID        — self-enroll is refused; an order (or an admin) creates it.
 *   INVITE_ONLY — an administrator enrolls the learner.
 *   PRIVATE     — never self-serve.
 */

const enrollmentCourseSelect = {
  id: true,
  slug: true,
  title: true,
  summary: true,
  level: true,
  accessType: true,
  status: true,
  priceCents: true,
  currency: true,
  durationMinutes: true,
  lessonCount: true,
  enrollmentCount: true,
  ratingAverage: true,
  isFeatured: true,
  publishedAt: true,
  thumbnail: { select: { url: true, storageKey: true, storageDriver: true } },
  category: { select: { id: true, slug: true, name: true } },
  translations: { select: { locale: true, title: true, summary: true } },
} satisfies Prisma.CourseSelect;

type EnrollmentCourseRow = Prisma.CourseGetPayload<{ select: typeof enrollmentCourseSelect }>;

function toCourseCard(course: EnrollmentCourseRow, locale: string): CourseCardDto {
  const translation = pickTranslation(course.translations, locale);
  return {
    id: course.id,
    slug: course.slug,
    title: applyTranslation(course.title, translation?.title),
    summary: applyTranslation(course.summary, translation?.summary),
    thumbnailUrl: course.thumbnail ? resolveMediaUrl(course.thumbnail) : null,
    level: course.level,
    accessType: course.accessType,
    priceCents: course.priceCents,
    currency: course.currency,
    durationMinutes: course.durationMinutes,
    lessonCount: course.lessonCount,
    enrollmentCount: course.enrollmentCount,
    ratingAverage: course.ratingAverage,
    status: course.status,
    isFeatured: course.isFeatured,
    publishedAt: course.publishedAt?.toISOString() ?? null,
    category: course.category,
    instructors: [],
    tags: [],
  };
}

export interface EnrollInput {
  userId: string;
  courseId: string;
  /** Set when an administrator or a paid order creates the enrollment. */
  source?: 'self' | 'admin' | 'order';
  emailVerified: boolean;
}

export async function enroll(input: EnrollInput): Promise<EnrollmentDto> {
  const course = await prisma.course.findFirst({
    where: { id: input.courseId, deletedAt: null },
    select: { id: true, status: true, accessType: true },
  });
  if (!course) throw new NotFoundError('Course');

  const isSelfService = (input.source ?? 'self') === 'self';

  if (isSelfService) {
    if (course.status !== 'PUBLISHED') throw new NotFoundError('Course');

    if (!input.emailVerified) {
      throw new AuthorizationError('Verify your email address before enrolling');
    }
    if (course.accessType === 'PAID') {
      throw new BadRequestError('This course must be purchased before you can enroll');
    }
    if (course.accessType === 'INVITE_ONLY' || course.accessType === 'PRIVATE') {
      throw new AuthorizationError('This course is available by invitation only');
    }
  }

  const existing = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId: input.userId, courseId: input.courseId } },
    select: { id: true, status: true },
  });

  if (existing && existing.status !== 'CANCELLED') {
    throw new ConflictError('You are already enrolled in this course');
  }

  const enrollment = existing
    ? await prisma.enrollment.update({
        where: { id: existing.id },
        data: { status: 'ACTIVE', enrolledAt: new Date(), completedAt: null },
        select: { id: true, status: true, enrolledAt: true, courseId: true },
      })
    : await prisma.$transaction(async (tx) => {
        const created = await tx.enrollment.create({
          data: {
            userId: input.userId,
            courseId: input.courseId,
            source: input.source ?? 'self',
          },
          select: { id: true, status: true, enrolledAt: true, courseId: true },
        });
        // Denormalised counter kept in the same transaction as the row it counts.
        await tx.course.update({
          where: { id: input.courseId },
          data: { enrollmentCount: { increment: 1 } },
        });
        return created;
      });

  // Seed the aggregate so the dashboard shows the course immediately.
  const totalLessons = await prisma.lesson.count({
    where: { isPublished: true, module: { courseId: input.courseId, isPublished: true } },
  });
  await prisma.courseProgress.upsert({
    where: { userId_courseId: { userId: input.userId, courseId: input.courseId } },
    create: { userId: input.userId, courseId: input.courseId, totalLessons },
    update: { totalLessons },
  });

  /*
   * The learner is not always the person who acted. An administrator granting
   * access, or an order clearing, reaches this line with someone else's session
   * on the request — and the whole value of the announcement is that their
   * dashboard grows a course while they are looking at it.
   */
  announceLearnerChange(input.userId, ['enrollments', 'progress']);

  return getEnrollment(input.userId, input.courseId, 'en');
}

export async function cancelEnrollment(userId: string, courseId: string): Promise<void> {
  const enrollment = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId } },
    select: { id: true, status: true },
  });
  if (!enrollment) throw new NotFoundError('Enrollment');
  if (enrollment.status === 'CANCELLED') return;

  await prisma.$transaction([
    prisma.enrollment.update({ where: { id: enrollment.id }, data: { status: 'CANCELLED' } }),
    prisma.course.update({
      where: { id: courseId },
      data: { enrollmentCount: { decrement: 1 } },
    }),
  ]);

  announceLearnerChange(userId, ['enrollments', 'progress']);
}

export async function getEnrollment(
  userId: string,
  courseId: string,
  locale: string,
): Promise<EnrollmentDto> {
  const enrollment = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId } },
    select: {
      id: true,
      status: true,
      enrolledAt: true,
      course: { select: enrollmentCourseSelect },
    },
  });
  if (!enrollment) throw new NotFoundError('Enrollment');

  const progress = await prisma.courseProgress.findUnique({
    where: { userId_courseId: { userId, courseId } },
  });

  return {
    id: enrollment.id,
    status: enrollment.status,
    enrolledAt: enrollment.enrolledAt.toISOString(),
    course: toCourseCard(enrollment.course, locale),
    progress: {
      courseId,
      completedLessons: progress?.completedLessons ?? 0,
      totalLessons: progress?.totalLessons ?? 0,
      progressPercent: progress?.progressPercent ?? 0,
      lastLessonId: progress?.lastLessonId ?? null,
      lastAccessedAt: progress?.lastAccessedAt?.toISOString() ?? null,
      completedAt: progress?.completedAt?.toISOString() ?? null,
    },
  };
}

export interface ListMyEnrollmentsInput {
  userId: string;
  locale: string;
  page: number;
  pageSize: number;
  filter?: 'all' | 'in-progress' | 'completed' | 'not-started';
}

export async function listMyEnrollments(
  input: ListMyEnrollmentsInput,
): Promise<PaginatedResult<EnrollmentDto>> {
  const where: Prisma.EnrollmentWhereInput = {
    userId: input.userId,
    status: { not: 'CANCELLED' },
    ...(input.filter === 'completed' ? { status: 'COMPLETED' } : {}),
  };

  const { skip, take } = toSkipTake(input.page, input.pageSize);

  const [enrollments, total] = await Promise.all([
    prisma.enrollment.findMany({
      where,
      orderBy: { enrolledAt: 'desc' },
      skip,
      take,
      select: {
        id: true,
        status: true,
        enrolledAt: true,
        courseId: true,
        course: { select: enrollmentCourseSelect },
      },
    }),
    prisma.enrollment.count({ where }),
  ]);

  const progressRows = await prisma.courseProgress.findMany({
    where: { userId: input.userId, courseId: { in: enrollments.map((entry) => entry.courseId) } },
  });
  const progressByCourse = new Map(progressRows.map((row) => [row.courseId, row]));

  let items: EnrollmentDto[] = enrollments.map((enrollment) => {
    const progress = progressByCourse.get(enrollment.courseId);
    return {
      id: enrollment.id,
      status: enrollment.status,
      enrolledAt: enrollment.enrolledAt.toISOString(),
      course: toCourseCard(enrollment.course, input.locale),
      progress: {
        courseId: enrollment.courseId,
        completedLessons: progress?.completedLessons ?? 0,
        totalLessons: progress?.totalLessons ?? enrollment.course.lessonCount,
        progressPercent: progress?.progressPercent ?? 0,
        lastLessonId: progress?.lastLessonId ?? null,
        lastAccessedAt: progress?.lastAccessedAt?.toISOString() ?? null,
        completedAt: progress?.completedAt?.toISOString() ?? null,
      },
    };
  });

  // Progress-based filters cannot be expressed in the enrollment query, so they
  // are applied to the page after the join.
  if (input.filter === 'in-progress') {
    items = items.filter(
      (item) => item.progress.progressPercent > 0 && item.progress.progressPercent < 100,
    );
  } else if (input.filter === 'not-started') {
    items = items.filter((item) => item.progress.progressPercent === 0);
  }

  return { items, meta: buildPaginationMeta(total, input.page, input.pageSize) };
}

/** "Continue learning" — most recently touched, unfinished courses. */
export async function getContinueLearning(
  userId: string,
  locale: string,
  limit = 3,
): Promise<EnrollmentDto[]> {
  const rows = await prisma.courseProgress.findMany({
    where: { userId, completedAt: null, lastAccessedAt: { not: null } },
    orderBy: { lastAccessedAt: 'desc' },
    take: Math.min(limit, 10),
    select: { courseId: true },
  });

  const enrollments: EnrollmentDto[] = [];
  for (const row of rows) {
    try {
      enrollments.push(await getEnrollment(userId, row.courseId, locale));
    } catch {
      // The course may have been archived since; skip rather than fail the page.
    }
  }
  return enrollments;
}

/* --------------------------------------------------------- administration */

export interface AdminListEnrollmentsInput {
  page: number;
  pageSize: number;
  courseId?: string;
  userId?: string;
  status?: string;
  search?: string;
}

export async function adminListEnrollments(input: AdminListEnrollmentsInput) {
  const where: Prisma.EnrollmentWhereInput = {
    ...(input.courseId ? { courseId: input.courseId } : {}),
    ...(input.userId ? { userId: input.userId } : {}),
    ...(input.status ? { status: input.status as never } : {}),
    ...(input.search
      ? {
          OR: [
            { user: { name: { contains: input.search, mode: 'insensitive' } } },
            { user: { email: { contains: input.search, mode: 'insensitive' } } },
            { course: { title: { contains: input.search, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };

  const { skip, take } = toSkipTake(input.page, input.pageSize);

  const [rows, total] = await Promise.all([
    prisma.enrollment.findMany({
      where,
      orderBy: { enrolledAt: 'desc' },
      skip,
      take,
      select: {
        id: true,
        status: true,
        enrolledAt: true,
        completedAt: true,
        source: true,
        user: { select: { id: true, name: true, email: true } },
        course: { select: { id: true, title: true, slug: true } },
      },
    }),
    prisma.enrollment.count({ where }),
  ]);

  const progressRows = await prisma.courseProgress.findMany({
    where: {
      OR: rows.map((row) => ({ userId: row.user.id, courseId: row.course.id })),
    },
    select: { userId: true, courseId: true, progressPercent: true },
  });
  const progressKey = (userId: string, courseId: string) => `${userId}:${courseId}`;
  const progressMap = new Map(
    progressRows.map((row) => [progressKey(row.userId, row.courseId), row.progressPercent]),
  );

  return {
    items: rows.map((row) => ({
      id: row.id,
      status: row.status,
      source: row.source,
      enrolledAt: row.enrolledAt.toISOString(),
      completedAt: row.completedAt?.toISOString() ?? null,
      user: row.user,
      course: row.course,
      progressPercent: progressMap.get(progressKey(row.user.id, row.course.id)) ?? 0,
    })),
    meta: buildPaginationMeta(total, input.page, input.pageSize),
  };
}
