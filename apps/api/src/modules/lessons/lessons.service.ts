import type { Prisma } from '@prisma/client';
import type { LessonDetailDto, ModuleSummaryDto, RichTextDocument } from '@academy/types';
import { FEATURE_KEYS } from '@academy/types';
import { jsonOrDbNull, prisma } from '../../lib/prisma.js';
import { AuthorizationError, BadRequestError, NotFoundError } from '../../lib/errors.js';
import { uniqueSlug } from '../../lib/slug.js';
import { resolveMediaUrl } from '../media/media.helpers.js';
import { applyTranslation, pickTranslation } from '../translations/translation.helpers.js';
import { recalculateCourseAggregates } from '../courses/courses.service.js';
import { isFeatureEnabled } from '../feature-flags/feature-flags.service.js';

/* --------------------------------------------------------------- modules */

export async function createModule(
  courseId: string,
  input: { title: string; summary?: string | null; sortOrder?: number; isPublished?: boolean },
): Promise<ModuleSummaryDto> {
  const course = await prisma.course.findFirst({
    where: { id: courseId, deletedAt: null },
    select: { id: true },
  });
  if (!course) throw new NotFoundError('Course');

  // Append to the end when no explicit position is given.
  const sortOrder =
    input.sortOrder ??
    ((await prisma.courseModule.aggregate({
      where: { courseId },
      _max: { sortOrder: true },
    }))._max.sortOrder ?? -1) + 1;

  const module = await prisma.courseModule.create({
    data: {
      courseId,
      title: input.title,
      summary: input.summary ?? null,
      sortOrder,
      isPublished: input.isPublished ?? true,
    },
    select: { id: true, title: true, summary: true, sortOrder: true },
  });

  await recalculateCourseAggregates(courseId);

  return { ...module, lessons: [] };
}

export async function updateModule(
  id: string,
  input: { title?: string; summary?: string | null; sortOrder?: number; isPublished?: boolean },
): Promise<void> {
  const module = await prisma.courseModule.findUnique({
    where: { id },
    select: { id: true, courseId: true },
  });
  if (!module) throw new NotFoundError('Module');

  await prisma.courseModule.update({ where: { id }, data: input });
  await recalculateCourseAggregates(module.courseId);
}

export async function deleteModule(id: string): Promise<void> {
  const module = await prisma.courseModule.findUnique({
    where: { id },
    select: { id: true, courseId: true },
  });
  if (!module) throw new NotFoundError('Module');

  // Lessons cascade with the module; progress rows cascade with the lessons.
  await prisma.courseModule.delete({ where: { id } });
  await recalculateCourseAggregates(module.courseId);
}

export async function reorderModules(
  courseId: string,
  items: { id: string; sortOrder: number }[],
): Promise<void> {
  // Only modules that really belong to this course may be reordered, otherwise
  // a crafted payload could shuffle another course's structure.
  const owned = await prisma.courseModule.findMany({
    where: { courseId, id: { in: items.map((item) => item.id) } },
    select: { id: true },
  });
  const ownedIds = new Set(owned.map((module) => module.id));

  await prisma.$transaction(
    items
      .filter((item) => ownedIds.has(item.id))
      .map((item) =>
        prisma.courseModule.update({ where: { id: item.id }, data: { sortOrder: item.sortOrder } }),
      ),
  );
}

/* --------------------------------------------------------------- lessons */

const lessonDetailSelect = {
  id: true,
  slug: true,
  title: true,
  summary: true,
  type: true,
  body: true,
  videoUrl: true,
  videoProvider: true,
  videoDurationSeconds: true,
  durationMinutes: true,
  sortOrder: true,
  isPreview: true,
  isPublished: true,
  moduleId: true,
  videoPoster: { select: { url: true, storageKey: true, storageDriver: true } },
  sourcePdf: {
    select: {
      url: true,
      storageKey: true,
      storageDriver: true,
      mimeType: true,
      sizeBytes: true,
      originalName: true,
      fileName: true,
    },
  },
  attachments: {
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true,
      label: true,
      mediaId: true,
      media: {
        select: { url: true, storageKey: true, storageDriver: true, mimeType: true, sizeBytes: true },
      },
    },
  },
  translations: { select: { locale: true, title: true, summary: true, body: true } },
  module: {
    select: {
      id: true,
      title: true,
      isPublished: true,
      course: { select: { id: true, slug: true, title: true, accessType: true, status: true } },
    },
  },
} satisfies Prisma.LessonSelect;

type LessonDetailRow = Prisma.LessonGetPayload<{ select: typeof lessonDetailSelect }>;

/**
 * Flat, ordered list of every reachable lesson in a course. Used to compute
 * previous/next links without loading full lesson bodies.
 */
async function getCourseLessonOrder(
  courseId: string,
  includeUnpublished: boolean,
): Promise<{ id: string }[]> {
  const modules = await prisma.courseModule.findMany({
    where: { courseId, ...(includeUnpublished ? {} : { isPublished: true }) },
    orderBy: { sortOrder: 'asc' },
    select: {
      lessons: {
        where: includeUnpublished ? {} : { isPublished: true },
        orderBy: { sortOrder: 'asc' },
        select: { id: true },
      },
    },
  });
  return modules.flatMap((module) => module.lessons);
}

async function toLessonDetail(
  lesson: LessonDetailRow,
  locale: string,
  viewerId: string | undefined,
  includeUnpublished: boolean,
): Promise<LessonDetailDto> {
  const translation = pickTranslation(lesson.translations, locale);
  const order = await getCourseLessonOrder(lesson.module.course.id, includeUnpublished);
  const index = order.findIndex((entry) => entry.id === lesson.id);

  const progress = viewerId
    ? await prisma.lessonProgress.findUnique({
        where: { userId_lessonId: { userId: viewerId, lessonId: lesson.id } },
        select: { isCompleted: true, completedAt: true, lastPositionSeconds: true, updatedAt: true },
      })
    : null;

  return {
    id: lesson.id,
    slug: lesson.slug,
    title: applyTranslation(lesson.title, translation?.title),
    summary: applyTranslation(lesson.summary, translation?.summary),
    type: lesson.type,
    durationMinutes: lesson.durationMinutes,
    sortOrder: lesson.sortOrder,
    isPreview: lesson.isPreview,
    moduleId: lesson.moduleId,
    moduleTitle: lesson.module.title,
    courseId: lesson.module.course.id,
    courseSlug: lesson.module.course.slug,
    courseTitle: lesson.module.course.title,
    body: ((translation?.body ?? lesson.body) as RichTextDocument | null) ?? null,
    video: lesson.videoUrl
      ? {
          url: lesson.videoUrl,
          provider: (lesson.videoProvider as 'file' | 'youtube' | 'vimeo') ?? 'file',
          posterUrl: lesson.videoPoster ? resolveMediaUrl(lesson.videoPoster) : null,
          durationSeconds: lesson.videoDurationSeconds,
        }
      : null,
    attachments: lesson.attachments.map((attachment) => ({
      id: attachment.id,
      label: attachment.label,
      mediaId: attachment.mediaId,
      url: resolveMediaUrl(attachment.media),
      mimeType: attachment.media.mimeType,
      sizeBytes: attachment.media.sizeBytes,
    })),
    sourcePdfUrl: lesson.sourcePdf ? resolveMediaUrl(lesson.sourcePdf) : null,
    pdfReader:
      lesson.sourcePdf && (await isFeatureEnabled(FEATURE_KEYS.PDF_READER))
        ? {
            url: lessonPdfStreamPath(lesson.module.course.slug, lesson.slug),
            fileName: lesson.sourcePdf.originalName || lesson.sourcePdf.fileName,
            sizeBytes: lesson.sourcePdf.sizeBytes,
          }
        : null,
    previousLessonId: index > 0 ? (order[index - 1]?.id ?? null) : null,
    nextLessonId: index >= 0 && index < order.length - 1 ? (order[index + 1]?.id ?? null) : null,
    progress: progress
      ? {
          lessonId: lesson.id,
          isCompleted: progress.isCompleted,
          completedAt: progress.completedAt?.toISOString() ?? null,
          lastPositionSeconds: progress.lastPositionSeconds,
          updatedAt: progress.updatedAt.toISOString(),
        }
      : null,
  };
}

/**
 * Authorization for lesson content — the single most important check in the
 * learning domain.
 *
 * Access is granted when ANY of these hold:
 *   - the lesson is marked as a free preview;
 *   - the course is FREE and the viewer is signed in;
 *   - the viewer has an active enrollment;
 *   - the viewer holds the course-management permission (staff preview).
 *
 * Hiding the "start lesson" button in the UI is not part of this decision.
 */
async function assertLessonAccess(
  lesson: LessonDetailRow,
  viewer: { id: string; canManageCourses: boolean } | undefined,
): Promise<void> {
  if (lesson.isPreview && lesson.isPublished) return;

  if (!viewer) {
    throw new AuthorizationError('Sign in to view this lesson');
  }
  if (viewer.canManageCourses) return;

  if (!lesson.isPublished || !lesson.module.isPublished || lesson.module.course.status !== 'PUBLISHED') {
    throw new NotFoundError('Lesson');
  }

  const enrollment = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId: viewer.id, courseId: lesson.module.course.id } },
    select: { status: true, expiresAt: true },
  });

  if (!enrollment || enrollment.status === 'CANCELLED') {
    throw new AuthorizationError('Enroll in this course to view its lessons');
  }
  if (enrollment.expiresAt && enrollment.expiresAt < new Date()) {
    throw new AuthorizationError('Your access to this course has expired');
  }
}

/**
 * Where the reader fetches the bytes.
 *
 * Relative on purpose: the browser calls the web app's own origin, which
 * forwards to the API (see `app/api/v1/[...path]/route.ts`). That keeps the
 * session cookie first-party, so the stream authenticates with the same
 * credential a server render uses and no access token has to be threaded into
 * pdf.js.
 */
function lessonPdfStreamPath(courseSlug: string, lessonSlug: string): string {
  return `/api/v1/courses/${encodeURIComponent(courseSlug)}/lessons/${encodeURIComponent(lessonSlug)}/pdf`;
}

export interface GetLessonInput {
  locale: string;
  viewer?: { id: string; canManageCourses: boolean } | undefined;
}

export async function getLessonById(id: string, input: GetLessonInput): Promise<LessonDetailDto> {
  const lesson = await prisma.lesson.findUnique({ where: { id }, select: lessonDetailSelect });
  if (!lesson || lesson.module.course.status === 'DISABLED') throw new NotFoundError('Lesson');

  await assertLessonAccess(lesson, input.viewer);

  return toLessonDetail(
    lesson,
    input.locale,
    input.viewer?.id,
    input.viewer?.canManageCourses ?? false,
  );
}

export async function getLessonBySlug(
  courseSlug: string,
  lessonSlug: string,
  input: GetLessonInput,
): Promise<LessonDetailDto> {
  const lesson = await prisma.lesson.findFirst({
    where: { slug: lessonSlug, module: { course: { slug: courseSlug, deletedAt: null } } },
    select: lessonDetailSelect,
  });
  if (!lesson) throw new NotFoundError('Lesson');

  await assertLessonAccess(lesson, input.viewer);

  return toLessonDetail(
    lesson,
    input.locale,
    input.viewer?.id,
    input.viewer?.canManageCourses ?? false,
  );
}

export interface LessonPdfSource {
  storageKey: string;
  storageDriver: string;
  mimeType: string;
  sizeBytes: number;
  fileName: string;
}

/**
 * Resolves the bytes behind the in-page reader.
 *
 * Runs the identical access check as the lesson body — `assertLessonAccess`,
 * not a lighter-weight variant. The stream is the content: gating the JSON that
 * describes a lesson while leaving its PDF open to anyone holding the URL would
 * be no gate at all. The feature flag is enforced separately, on the route.
 */
export async function getLessonPdfSource(
  courseSlug: string,
  lessonSlug: string,
  viewer: { id: string; canManageCourses: boolean } | undefined,
): Promise<LessonPdfSource> {
  const lesson = await prisma.lesson.findFirst({
    where: { slug: lessonSlug, module: { course: { slug: courseSlug, deletedAt: null } } },
    select: lessonDetailSelect,
  });
  if (!lesson) throw new NotFoundError('Lesson');

  await assertLessonAccess(lesson, viewer);

  const pdf = lesson.sourcePdf;
  if (!pdf) throw new NotFoundError('Lesson PDF');

  return {
    storageKey: pdf.storageKey,
    storageDriver: pdf.storageDriver,
    mimeType: pdf.mimeType,
    sizeBytes: pdf.sizeBytes,
    fileName: pdf.originalName || pdf.fileName,
  };
}

/* ------------------------------------------------------------- mutations */

export interface LessonInput {
  title: string;
  slug?: string;
  summary?: string | null;
  type?: string;
  body?: RichTextDocument | null;
  video?: {
    url: string;
    provider: string;
    posterMediaId?: string | null;
    durationSeconds?: number | null;
  } | null;
  durationMinutes?: number | null;
  sortOrder?: number;
  isPreview?: boolean;
  isPublished?: boolean;
  sourcePdfMediaId?: string | null;
  attachmentMediaIds?: string[];
}

/**
 * Estimates reading time from a rich-text document so admins do not have to
 * enter a duration by hand. 200 words/minute with a one-minute floor.
 */
export function estimateReadingMinutes(body: RichTextDocument | null | undefined): number {
  if (!body) return 1;

  let words = 0;
  const walk = (nodes: unknown[]): void => {
    for (const node of nodes) {
      if (!node || typeof node !== 'object') continue;
      const typed = node as { type?: string; text?: string; content?: unknown[] };
      if (typed.type === 'text' && typeof typed.text === 'string') {
        words += typed.text.trim().split(/\s+/).filter(Boolean).length;
      }
      if (Array.isArray(typed.content)) walk(typed.content);
    }
  };
  walk(body.content ?? []);

  return Math.max(1, Math.round(words / 200));
}

export async function createLesson(moduleId: string, input: LessonInput): Promise<LessonDetailDto> {
  const module = await prisma.courseModule.findUnique({
    where: { id: moduleId },
    select: { id: true, courseId: true },
  });
  if (!module) throw new NotFoundError('Module');

  const slug = await uniqueSlug(
    input.slug ?? input.title,
    async (candidate) =>
      (await prisma.lesson.count({ where: { moduleId, slug: candidate } })) > 0,
    { fallbackPrefix: 'lesson' },
  );

  const sortOrder =
    input.sortOrder ??
    ((await prisma.lesson.aggregate({ where: { moduleId }, _max: { sortOrder: true } }))._max
      .sortOrder ?? -1) + 1;

  const lesson = await prisma.lesson.create({
    data: {
      moduleId,
      slug,
      title: input.title,
      summary: input.summary ?? null,
      type: (input.type as never) ?? (input.video ? 'VIDEO' : 'ARTICLE'),
      body: jsonOrDbNull(input.body),
      videoUrl: input.video?.url ?? null,
      videoProvider: input.video?.provider ?? null,
      videoPosterMediaId: input.video?.posterMediaId ?? null,
      videoDurationSeconds: input.video?.durationSeconds ?? null,
      sourcePdfMediaId: input.sourcePdfMediaId ?? null,
      durationMinutes: input.durationMinutes ?? estimateReadingMinutes(input.body),
      sortOrder,
      isPreview: input.isPreview ?? false,
      isPublished: input.isPublished ?? true,
      attachments: {
        create: (input.attachmentMediaIds ?? []).map((mediaId, index) => ({
          mediaId,
          label: `Attachment ${index + 1}`,
          sortOrder: index,
        })),
      },
    },
    select: { id: true },
  });

  await recalculateCourseAggregates(module.courseId);

  return getLessonForAdmin(lesson.id, 'en');
}

export async function updateLesson(id: string, input: Partial<LessonInput>): Promise<LessonDetailDto> {
  const existing = await prisma.lesson.findUnique({
    where: { id },
    select: { id: true, slug: true, moduleId: true, module: { select: { courseId: true } } },
  });
  if (!existing) throw new NotFoundError('Lesson');

  const slug =
    input.slug && input.slug !== existing.slug
      ? await uniqueSlug(
          input.slug,
          async (candidate) =>
            (await prisma.lesson.count({
              where: { moduleId: existing.moduleId, slug: candidate, id: { not: id } },
            })) > 0,
          { fallbackPrefix: 'lesson' },
        )
      : undefined;

  await prisma.$transaction(async (tx) => {
    if (input.attachmentMediaIds) {
      await tx.lessonAttachment.deleteMany({ where: { lessonId: id } });
      if (input.attachmentMediaIds.length > 0) {
        await tx.lessonAttachment.createMany({
          data: input.attachmentMediaIds.map((mediaId, index) => ({
            lessonId: id,
            mediaId,
            label: `Attachment ${index + 1}`,
            sortOrder: index,
          })),
        });
      }
    }

    await tx.lesson.update({
      where: { id },
      data: {
        ...(slug ? { slug } : {}),
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.summary !== undefined ? { summary: input.summary } : {}),
        ...(input.type !== undefined ? { type: input.type as never } : {}),
        ...(input.body !== undefined ? { body: jsonOrDbNull(input.body) } : {}),
        ...(input.video !== undefined
          ? {
              videoUrl: input.video?.url ?? null,
              videoProvider: input.video?.provider ?? null,
              videoPosterMediaId: input.video?.posterMediaId ?? null,
              videoDurationSeconds: input.video?.durationSeconds ?? null,
            }
          : {}),
        ...(input.sourcePdfMediaId !== undefined
          ? { sourcePdfMediaId: input.sourcePdfMediaId }
          : {}),
        ...(input.durationMinutes !== undefined ? { durationMinutes: input.durationMinutes } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        ...(input.isPreview !== undefined ? { isPreview: input.isPreview } : {}),
        ...(input.isPublished !== undefined ? { isPublished: input.isPublished } : {}),
      },
    });
  });

  await recalculateCourseAggregates(existing.module.courseId);

  return getLessonForAdmin(id, 'en');
}

export async function deleteLesson(id: string): Promise<void> {
  const lesson = await prisma.lesson.findUnique({
    where: { id },
    select: { id: true, module: { select: { courseId: true } } },
  });
  if (!lesson) throw new NotFoundError('Lesson');

  await prisma.lesson.delete({ where: { id } });
  await recalculateCourseAggregates(lesson.module.courseId);
}

export async function reorderLessons(
  moduleId: string,
  items: { id: string; sortOrder: number }[],
): Promise<void> {
  const owned = await prisma.lesson.findMany({
    where: { moduleId, id: { in: items.map((item) => item.id) } },
    select: { id: true },
  });
  const ownedIds = new Set(owned.map((lesson) => lesson.id));

  if (ownedIds.size !== items.length) {
    throw new BadRequestError('One or more lessons do not belong to this module');
  }

  await prisma.$transaction(
    items.map((item) =>
      prisma.lesson.update({ where: { id: item.id }, data: { sortOrder: item.sortOrder } }),
    ),
  );
}

/** Admin view: bypasses publication and enrollment checks by design. */
export async function getLessonForAdmin(id: string, locale: string): Promise<LessonDetailDto> {
  const lesson = await prisma.lesson.findUnique({ where: { id }, select: lessonDetailSelect });
  if (!lesson) throw new NotFoundError('Lesson');
  return toLessonDetail(lesson, locale, undefined, true);
}
