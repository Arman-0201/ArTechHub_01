import { REALTIME_RESOURCES } from '@academy/types';
import type {
  CourseProgressDto,
  EnrollmentDto,
  LearningStatsDto,
  LessonProgressDto,
} from '@academy/types';
import { prisma } from '../../lib/prisma.js';
import { AuthorizationError, NotFoundError } from '../../lib/errors.js';
import { announceLearnerChange, announceVisitorActivity } from '../../realtime/events.js';

/**
 * Progress is server-authoritative.
 *
 * `LessonProgress` is the fact table; `CourseProgress` is a persisted
 * aggregate recomputed inside the same transaction as every write. Dashboards
 * and course cards therefore read a single row instead of aggregating, and no
 * client-side arithmetic can disagree with the server.
 */

async function assertEnrolled(userId: string, courseId: string): Promise<void> {
  const enrollment = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId } },
    select: { status: true, expiresAt: true },
  });

  if (!enrollment || enrollment.status === 'CANCELLED') {
    throw new AuthorizationError('You are not enrolled in this course');
  }
  if (enrollment.expiresAt && enrollment.expiresAt < new Date()) {
    throw new AuthorizationError('Your access to this course has expired');
  }
}

/** Total reachable lessons — the denominator for every percentage. */
async function countReachableLessons(courseId: string): Promise<number> {
  return prisma.lesson.count({
    where: { isPublished: true, module: { courseId, isPublished: true } },
  });
}

async function recomputeCourseProgress(
  userId: string,
  courseId: string,
  lastLessonId?: string,
): Promise<CourseProgressDto> {
  const [completedLessons, totalLessons] = await Promise.all([
    prisma.lessonProgress.count({
      where: {
        userId,
        courseId,
        isCompleted: true,
        lesson: { isPublished: true, module: { isPublished: true } },
      },
    }),
    countReachableLessons(courseId),
  ]);

  const progressPercent =
    totalLessons > 0 ? Math.min(100, Math.round((completedLessons / totalLessons) * 100)) : 0;
  const isCourseComplete = totalLessons > 0 && completedLessons >= totalLessons;
  const now = new Date();

  const existing = await prisma.courseProgress.findUnique({
    where: { userId_courseId: { userId, courseId } },
    select: { completedAt: true },
  });

  // Completion is stamped once and kept: re-opening a finished course must not
  // move the date, but un-completing a lesson clears it again.
  const completedAt = isCourseComplete ? (existing?.completedAt ?? now) : null;

  const row = await prisma.courseProgress.upsert({
    where: { userId_courseId: { userId, courseId } },
    create: {
      userId,
      courseId,
      completedLessons,
      totalLessons,
      progressPercent,
      lastLessonId: lastLessonId ?? null,
      lastAccessedAt: now,
      completedAt,
    },
    update: {
      completedLessons,
      totalLessons,
      progressPercent,
      ...(lastLessonId ? { lastLessonId } : {}),
      lastAccessedAt: now,
      completedAt,
    },
  });

  // Keep the enrollment status in step with the aggregate in both directions.
  if (isCourseComplete) {
    await prisma.enrollment.updateMany({
      where: { userId, courseId, status: 'ACTIVE' },
      data: { status: 'COMPLETED', completedAt },
    });
  } else {
    await prisma.enrollment.updateMany({
      where: { userId, courseId, status: 'COMPLETED' },
      data: { status: 'ACTIVE', completedAt: null },
    });
  }

  return {
    courseId,
    completedLessons,
    totalLessons,
    progressPercent,
    lastLessonId: row.lastLessonId,
    lastAccessedAt: row.lastAccessedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

/** Records that the user studied today; the basis for streak calculation. */
async function touchLearningDay(userId: string, minutes: number, lessonsDone: number): Promise<void> {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  await prisma.learningDay.upsert({
    where: { userId_day: { userId, day: today } },
    create: { userId, day: today, minutesLearned: minutes, lessonsDone },
    update: {
      minutesLearned: { increment: minutes },
      lessonsDone: { increment: lessonsDone },
    },
  });
}

export interface UpdateLessonProgressInput {
  userId: string;
  lessonId: string;
  isCompleted?: boolean;
  lastPositionSeconds?: number;
}

export async function updateLessonProgress(
  input: UpdateLessonProgressInput,
): Promise<{ lesson: LessonProgressDto; course: CourseProgressDto }> {
  const lesson = await prisma.lesson.findUnique({
    where: { id: input.lessonId },
    select: {
      id: true,
      durationMinutes: true,
      isPublished: true,
      module: { select: { courseId: true, isPublished: true } },
    },
  });
  if (!lesson) throw new NotFoundError('Lesson');

  const courseId = lesson.module.courseId;
  await assertEnrolled(input.userId, courseId);

  const previous = await prisma.lessonProgress.findUnique({
    where: { userId_lessonId: { userId: input.userId, lessonId: input.lessonId } },
    select: { isCompleted: true },
  });

  const willBeCompleted = input.isCompleted ?? previous?.isCompleted ?? false;
  const now = new Date();

  const row = await prisma.lessonProgress.upsert({
    where: { userId_lessonId: { userId: input.userId, lessonId: input.lessonId } },
    create: {
      userId: input.userId,
      lessonId: input.lessonId,
      courseId,
      isCompleted: willBeCompleted,
      completedAt: willBeCompleted ? now : null,
      lastPositionSeconds: input.lastPositionSeconds ?? 0,
    },
    update: {
      ...(input.isCompleted !== undefined
        ? {
            isCompleted: input.isCompleted,
            // Clearing the flag also clears the timestamp, so "completed on"
            // never survives an un-complete.
            completedAt: input.isCompleted ? (previous?.isCompleted ? undefined : now) : null,
          }
        : {}),
      ...(input.lastPositionSeconds !== undefined
        ? { lastPositionSeconds: input.lastPositionSeconds }
        : {}),
    },
  });

  // Credit the day only on the transition to complete, so re-marking a lesson
  // cannot inflate the streak or minutes learned.
  const justCompleted = willBeCompleted && !previous?.isCompleted;
  if (justCompleted) {
    await touchLearningDay(input.userId, lesson.durationMinutes ?? 0, 1);
  }

  const course = await recomputeCourseProgress(input.userId, courseId, input.lessonId);

  /*
   * Announced after the aggregate is recomputed, never before: the event says
   * "go and read again", and every other tab this learner has open will do
   * exactly that. Firing early would have them read the old percentage.
   *
   * The tab that made the change hears it too, and re-reads a value it already
   * has. That is the point — one write, every window in agreement, without the
   * writer having to know which other screens exist.
   */
  announceLearnerChange(input.userId, ['progress']);

  /*
   * Admins see completions, but only the transition — never the scrubbing.
   *
   * This is the one visitor event with genuine volume behind it: a busy
   * platform completes lessons constantly, and `broadcastChange` walks every
   * subscriber. `justCompleted` is already the flag that decides whether the
   * learning day is credited, and it is the right gate here for the same
   * reason — re-marking an already-complete lesson, or saving a video
   * position, is not news to anyone.
   *
   * `enrollments` rather than `courses`: what moved is a learner's standing in
   * the enrollment list, not the catalogue.
   */
  if (justCompleted) {
    announceVisitorActivity([REALTIME_RESOURCES.ENROLLMENTS]);
  }

  return {
    lesson: {
      lessonId: row.lessonId,
      isCompleted: row.isCompleted,
      completedAt: row.completedAt?.toISOString() ?? null,
      lastPositionSeconds: row.lastPositionSeconds,
      updatedAt: row.updatedAt.toISOString(),
    },
    course,
  };
}

/** Called when a lesson page opens, to keep "continue learning" accurate. */
export async function markLessonVisited(userId: string, lessonId: string): Promise<void> {
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: { module: { select: { courseId: true } } },
  });
  if (!lesson) return;

  const enrollment = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId: lesson.module.courseId } },
    select: { id: true },
  });
  if (!enrollment) return;

  await prisma.courseProgress.upsert({
    where: { userId_courseId: { userId, courseId: lesson.module.courseId } },
    create: {
      userId,
      courseId: lesson.module.courseId,
      lastLessonId: lessonId,
      lastAccessedAt: new Date(),
      totalLessons: await countReachableLessons(lesson.module.courseId),
    },
    update: { lastLessonId: lessonId, lastAccessedAt: new Date() },
  });
}

export async function getCourseProgress(
  userId: string,
  courseId: string,
): Promise<CourseProgressDto> {
  const row = await prisma.courseProgress.findUnique({
    where: { userId_courseId: { userId, courseId } },
  });

  if (!row) {
    return {
      courseId,
      completedLessons: 0,
      totalLessons: await countReachableLessons(courseId),
      progressPercent: 0,
      lastLessonId: null,
      lastAccessedAt: null,
      completedAt: null,
    };
  }

  return {
    courseId,
    completedLessons: row.completedLessons,
    totalLessons: row.totalLessons,
    progressPercent: row.progressPercent,
    lastLessonId: row.lastLessonId,
    lastAccessedAt: row.lastAccessedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

/** Ids of every completed lesson in a course — drives the sidebar ticks. */
export async function getCompletedLessonIds(userId: string, courseId: string): Promise<string[]> {
  const rows = await prisma.lessonProgress.findMany({
    where: { userId, courseId, isCompleted: true },
    select: { lessonId: true },
  });
  return rows.map((row) => row.lessonId);
}

/**
 * Current streak in days.
 *
 * Counts back from today (or yesterday, so a streak is not lost before the day
 * is over) while consecutive learning days exist.
 */
function computeStreak(days: Date[]): number {
  if (days.length === 0) return 0;

  const dayKeys = new Set(days.map((day) => day.toISOString().slice(0, 10)));
  const cursor = new Date();
  cursor.setUTCHours(0, 0, 0, 0);

  if (!dayKeys.has(cursor.toISOString().slice(0, 10))) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
    if (!dayKeys.has(cursor.toISOString().slice(0, 10))) return 0;
  }

  let streak = 0;
  while (dayKeys.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

export async function computeLearningStats(userId: string): Promise<LearningStatsDto> {
  const [progressRows, learningDays, minutesAggregate] = await Promise.all([
    prisma.courseProgress.findMany({
      where: { userId },
      select: { completedLessons: true, totalLessons: true, progressPercent: true },
    }),
    prisma.learningDay.findMany({
      where: { userId },
      orderBy: { day: 'desc' },
      take: 400,
      select: { day: true },
    }),
    prisma.learningDay.aggregate({ where: { userId }, _sum: { minutesLearned: true } }),
  ]);

  const enrollmentCount = await prisma.enrollment.count({
    where: { userId, status: { not: 'CANCELLED' } },
  });

  const completed = progressRows.filter((row) => row.progressPercent >= 100).length;
  const inProgress = progressRows.filter(
    (row) => row.progressPercent > 0 && row.progressPercent < 100,
  ).length;
  const lessonsCompleted = progressRows.reduce((total, row) => total + row.completedLessons, 0);
  const totalLessons = progressRows.reduce((total, row) => total + row.totalLessons, 0);

  return {
    totalCourses: enrollmentCount,
    inProgress,
    completed,
    // Enrolled courses with no progress row yet also count as not started.
    notStarted: Math.max(0, enrollmentCount - completed - inProgress),
    lessonsCompleted,
    totalLessons,
    overallProgressPercent:
      totalLessons > 0 ? Math.round((lessonsCompleted / totalLessons) * 100) : 0,
    currentStreakDays: computeStreak(learningDays.map((entry) => entry.day)),
    minutesLearned: minutesAggregate._sum.minutesLearned ?? 0,
  };
}

export type { EnrollmentDto };
