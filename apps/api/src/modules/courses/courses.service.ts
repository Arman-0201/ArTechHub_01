import type { Prisma } from '@prisma/client';
import type {
  CourseCardDto,
  CourseDetailDto,
  ModuleSummaryDto,
  PaginatedResult,
  RichTextDocument,
  SeoDto,
} from '@academy/types';
import { jsonOrDbNull, prisma } from '../../lib/prisma.js';
import { BadRequestError, NotFoundError } from '../../lib/errors.js';
import { buildPaginationMeta, toSkipTake } from '../../lib/http.js';
import { uniqueSlug } from '../../lib/slug.js';
import { resolveMediaUrl } from '../media/media.helpers.js';
import { applyTranslation, pickTranslation } from '../translations/translation.helpers.js';
import { toSeoDto, upsertSeo } from '../seo/seo.service.js';

/* ----------------------------------------------------------------- selects */

const courseCardSelect = {
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
  instructors: {
    orderBy: { sortOrder: 'asc' },
    select: {
      instructor: {
        select: {
          id: true,
          slug: true,
          name: true,
          avatar: { select: { url: true, storageKey: true, storageDriver: true } },
        },
      },
    },
  },
  tags: { select: { tag: { select: { name: true } } } },
  translations: { select: { locale: true, title: true, summary: true } },
} satisfies Prisma.CourseSelect;

type CourseCardRow = Prisma.CourseGetPayload<{ select: typeof courseCardSelect }>;

function toCard(course: CourseCardRow, locale: string): CourseCardDto {
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
    instructors: course.instructors.map((entry) => ({
      id: entry.instructor.id,
      slug: entry.instructor.slug,
      name: entry.instructor.name,
      avatarUrl: entry.instructor.avatar ? resolveMediaUrl(entry.instructor.avatar) : null,
    })),
    tags: course.tags.map((entry) => entry.tag.name),
  };
}

/* --------------------------------------------------------------- listing */

const SORTABLE_COURSE_FIELDS = new Set([
  'publishedAt',
  'createdAt',
  'title',
  'enrollmentCount',
  'durationMinutes',
]);

export interface ListCoursesInput {
  locale: string;
  page: number;
  pageSize: number;
  search?: string;
  category?: string;
  categoryId?: string;
  level?: string;
  access?: string;
  status?: string;
  tag?: string;
  instructor?: string;
  featured?: boolean;
  sort?: string;
  order: 'asc' | 'desc';
  /** Public catalogue requests are forced to published-only. */
  includeUnpublished?: boolean;
}

export async function listCourses(
  input: ListCoursesInput,
): Promise<PaginatedResult<CourseCardDto>> {
  const where: Prisma.CourseWhereInput = {
    deletedAt: null,
    // The public catalogue never sees drafts, and a client cannot opt into them
    // by sending `status=DRAFT` — only the admin router sets includeUnpublished.
    ...(input.includeUnpublished
      ? input.status
        ? { status: input.status as never }
        : {}
      : { status: 'PUBLISHED' }),
    ...(input.categoryId ? { categoryId: input.categoryId } : {}),
    ...(input.category ? { category: { slug: input.category } } : {}),
    ...(input.level ? { level: input.level as never } : {}),
    ...(input.access ? { accessType: input.access as never } : {}),
    ...(input.featured !== undefined ? { isFeatured: input.featured } : {}),
    ...(input.tag ? { tags: { some: { tag: { slug: input.tag } } } } : {}),
    ...(input.instructor
      ? { instructors: { some: { instructor: { slug: input.instructor } } } }
      : {}),
    ...(input.search
      ? {
          OR: [
            { title: { contains: input.search, mode: 'insensitive' } },
            { summary: { contains: input.search, mode: 'insensitive' } },
            { tags: { some: { tag: { name: { contains: input.search, mode: 'insensitive' } } } } },
          ],
        }
      : {}),
  };

  const sortField =
    input.sort && SORTABLE_COURSE_FIELDS.has(input.sort) ? input.sort : 'publishedAt';
  const { skip, take } = toSkipTake(input.page, input.pageSize);

  const [courses, total] = await Promise.all([
    prisma.course.findMany({
      where,
      // Featured courses lead the catalogue; the requested sort orders the rest.
      orderBy: [{ isFeatured: 'desc' }, { [sortField]: input.order }],
      skip,
      take,
      select: courseCardSelect,
    }),
    prisma.course.count({ where }),
  ]);

  return {
    items: courses.map((course) => toCard(course, input.locale)),
    meta: buildPaginationMeta(total, input.page, input.pageSize),
  };
}

export async function listFeaturedCourses(locale: string, limit = 6): Promise<CourseCardDto[]> {
  const courses = await prisma.course.findMany({
    where: { status: 'PUBLISHED', deletedAt: null },
    orderBy: [{ isFeatured: 'desc' }, { enrollmentCount: 'desc' }, { publishedAt: 'desc' }],
    take: Math.min(limit, 24),
    select: courseCardSelect,
  });
  return courses.map((course) => toCard(course, locale));
}

/* ---------------------------------------------------------------- detail */

const courseDetailSelect = {
  ...courseCardSelect,
  description: true,
  learningOutcomes: true,
  requirements: true,
  language: true,
  updatedAt: true,
  seo: true,
  modules: {
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true,
      title: true,
      summary: true,
      sortOrder: true,
      isPublished: true,
      translations: { select: { locale: true, title: true, summary: true } },
      lessons: {
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true,
          slug: true,
          title: true,
          type: true,
          durationMinutes: true,
          sortOrder: true,
          isPreview: true,
          isPublished: true,
          translations: { select: { locale: true, title: true } },
        },
      },
    },
  },
} satisfies Prisma.CourseSelect;

type CourseDetailRow = Prisma.CourseGetPayload<{ select: typeof courseDetailSelect }>;

function toModuleSummaries(
  modules: CourseDetailRow['modules'],
  locale: string,
  includeUnpublished: boolean,
): ModuleSummaryDto[] {
  return modules
    .filter((module) => includeUnpublished || module.isPublished)
    .map((module) => {
      const moduleTranslation = pickTranslation(module.translations, locale);
      return {
        id: module.id,
        title: applyTranslation(module.title, moduleTranslation?.title),
        summary: applyTranslation(module.summary, moduleTranslation?.summary),
        sortOrder: module.sortOrder,
        lessons: module.lessons
          .filter((lesson) => includeUnpublished || lesson.isPublished)
          .map((lesson) => {
            const lessonTranslation = pickTranslation(lesson.translations, locale);
            return {
              id: lesson.id,
              slug: lesson.slug,
              title: applyTranslation(lesson.title, lessonTranslation?.title),
              type: lesson.type,
              durationMinutes: lesson.durationMinutes,
              sortOrder: lesson.sortOrder,
              isPreview: lesson.isPreview,
              isPublished: lesson.isPublished,
            };
          }),
      };
    });
}

export interface GetCourseInput {
  locale: string;
  viewerId?: string | undefined;
  includeUnpublished?: boolean;
}

async function buildCourseDetail(
  course: CourseDetailRow,
  input: GetCourseInput,
): Promise<CourseDetailDto> {
  const translation = pickTranslation(course.translations, input.locale);
  const card = toCard(course, input.locale);

  let viewer: CourseDetailDto['viewer'] = null;

  if (input.viewerId) {
    const [enrollment, progress] = await Promise.all([
      prisma.enrollment.findUnique({
        where: { userId_courseId: { userId: input.viewerId, courseId: course.id } },
        select: { status: true },
      }),
      prisma.courseProgress.findUnique({
        where: { userId_courseId: { userId: input.viewerId, courseId: course.id } },
        select: { progressPercent: true, lastLessonId: true },
      }),
    ]);

    viewer = {
      isEnrolled: Boolean(enrollment),
      enrollmentStatus: enrollment?.status ?? null,
      progressPercent: progress?.progressPercent ?? 0,
      // Resume where the learner stopped, or at the first lesson if they have
      // enrolled but never opened anything.
      resumeLessonId:
        progress?.lastLessonId ??
        course.modules.flatMap((module) => module.lessons)[0]?.id ??
        null,
    };
  }

  const fullTranslation = await prisma.courseTranslation.findUnique({
    where: { courseId_locale: { courseId: course.id, locale: input.locale } },
    select: { description: true, learningOutcomes: true, requirements: true },
  });

  return {
    ...card,
    description:
      ((fullTranslation?.description ?? course.description) as RichTextDocument | null) ?? null,
    learningOutcomes:
      fullTranslation?.learningOutcomes?.length
        ? fullTranslation.learningOutcomes
        : course.learningOutcomes,
    requirements:
      fullTranslation?.requirements?.length ? fullTranslation.requirements : course.requirements,
    language: course.language,
    modules: toModuleSummaries(course.modules, input.locale, input.includeUnpublished ?? false),
    seo: course.seo ? toSeoDto(course.seo) : null,
    updatedAt: course.updatedAt.toISOString(),
    viewer,
    title: applyTranslation(course.title, translation?.title),
  };
}

export async function getCourseBySlug(
  slug: string,
  input: GetCourseInput,
): Promise<CourseDetailDto> {
  const course = await prisma.course.findFirst({
    where: {
      slug,
      deletedAt: null,
      ...(input.includeUnpublished ? {} : { status: 'PUBLISHED' }),
    },
    select: courseDetailSelect,
  });
  if (!course) throw new NotFoundError('Course');
  return buildCourseDetail(course, input);
}

export async function getCourseById(id: string, input: GetCourseInput): Promise<CourseDetailDto> {
  const course = await prisma.course.findFirst({
    where: { id, deletedAt: null },
    select: courseDetailSelect,
  });
  if (!course) throw new NotFoundError('Course');
  return buildCourseDetail(course, input);
}

/* -------------------------------------------------------------- mutations */

export interface CourseInput {
  title: string;
  slug?: string;
  summary?: string | null;
  description?: RichTextDocument | null;
  thumbnailMediaId?: string | null;
  categoryId?: string | null;
  level?: string;
  accessType?: string;
  priceCents?: number | null;
  currency?: string | null;
  durationMinutes?: number | null;
  language?: string;
  learningOutcomes?: string[];
  requirements?: string[];
  tags?: string[];
  instructorIds?: string[];
  isFeatured?: boolean;
  status?: string;
  seo?: Partial<SeoDto>;
}

async function resolveTagIds(names: string[]): Promise<string[]> {
  const ids: string[] = [];
  for (const name of names) {
    const slug = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!slug) continue;
    const tag = await prisma.tag.upsert({
      where: { slug },
      create: { slug, name: name.trim() },
      update: {},
      select: { id: true },
    });
    ids.push(tag.id);
  }
  return ids;
}

function validatePricing(accessType: string | undefined, priceCents: number | null | undefined) {
  if (accessType === 'PAID' && (priceCents === null || priceCents === undefined || priceCents <= 0)) {
    throw new BadRequestError('Paid courses need a price above zero');
  }
}

export async function createCourse(input: CourseInput, locale: string): Promise<CourseDetailDto> {
  validatePricing(input.accessType, input.priceCents);

  const slug = await uniqueSlug(
    input.slug ?? input.title,
    async (candidate) => (await prisma.course.count({ where: { slug: candidate } })) > 0,
    { fallbackPrefix: 'course' },
  );

  const tagIds = input.tags ? await resolveTagIds(input.tags) : [];

  const course = await prisma.course.create({
    data: {
      slug,
      title: input.title,
      summary: input.summary ?? null,
      description: jsonOrDbNull(input.description),
      thumbnailMediaId: input.thumbnailMediaId ?? null,
      categoryId: input.categoryId ?? null,
      level: (input.level as never) ?? 'BEGINNER',
      accessType: (input.accessType as never) ?? 'FREE',
      status: (input.status as never) ?? 'DRAFT',
      priceCents: input.priceCents ?? null,
      currency: input.currency ?? null,
      durationMinutes: input.durationMinutes ?? null,
      language: input.language ?? locale,
      learningOutcomes: input.learningOutcomes ?? [],
      requirements: input.requirements ?? [],
      isFeatured: input.isFeatured ?? false,
      publishedAt: input.status === 'PUBLISHED' ? new Date() : null,
      tags: { create: tagIds.map((tagId) => ({ tagId })) },
      instructors: {
        create: (input.instructorIds ?? []).map((instructorId, index) => ({
          instructorId,
          sortOrder: index,
        })),
      },
    },
    select: { id: true },
  });

  if (input.seo) await upsertSeo({ courseId: course.id }, input.seo);

  return getCourseById(course.id, { locale, includeUnpublished: true });
}

export async function updateCourse(
  id: string,
  input: Partial<CourseInput>,
  locale: string,
): Promise<CourseDetailDto> {
  const existing = await prisma.course.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, slug: true, status: true, publishedAt: true, accessType: true, priceCents: true },
  });
  if (!existing) throw new NotFoundError('Course');

  validatePricing(
    input.accessType ?? existing.accessType,
    input.priceCents !== undefined ? input.priceCents : existing.priceCents,
  );

  const slug =
    input.slug && input.slug !== existing.slug
      ? await uniqueSlug(
          input.slug,
          async (candidate) =>
            (await prisma.course.count({ where: { slug: candidate, id: { not: id } } })) > 0,
          { fallbackPrefix: 'course' },
        )
      : undefined;

  // `publishedAt` is stamped the first time a course goes live and never moved
  // afterwards, so "newest courses" ordering stays stable across edits.
  const becomingPublished = input.status === 'PUBLISHED' && existing.status !== 'PUBLISHED';

  await prisma.$transaction(async (tx) => {
    if (input.tags) {
      const tagIds = await resolveTagIds(input.tags);
      await tx.courseTag.deleteMany({ where: { courseId: id } });
      if (tagIds.length > 0) {
        await tx.courseTag.createMany({ data: tagIds.map((tagId) => ({ courseId: id, tagId })) });
      }
    }

    if (input.instructorIds) {
      await tx.courseInstructor.deleteMany({ where: { courseId: id } });
      if (input.instructorIds.length > 0) {
        await tx.courseInstructor.createMany({
          data: input.instructorIds.map((instructorId, index) => ({
            courseId: id,
            instructorId,
            sortOrder: index,
          })),
        });
      }
    }

    await tx.course.update({
      where: { id },
      data: {
        ...(slug ? { slug } : {}),
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.summary !== undefined ? { summary: input.summary } : {}),
        ...(input.description !== undefined ? { description: jsonOrDbNull(input.description) } : {}),
        ...(input.thumbnailMediaId !== undefined
          ? { thumbnailMediaId: input.thumbnailMediaId }
          : {}),
        ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
        ...(input.level !== undefined ? { level: input.level as never } : {}),
        ...(input.accessType !== undefined ? { accessType: input.accessType as never } : {}),
        ...(input.status !== undefined ? { status: input.status as never } : {}),
        ...(input.priceCents !== undefined ? { priceCents: input.priceCents } : {}),
        ...(input.currency !== undefined ? { currency: input.currency } : {}),
        ...(input.durationMinutes !== undefined ? { durationMinutes: input.durationMinutes } : {}),
        ...(input.language !== undefined ? { language: input.language } : {}),
        ...(input.learningOutcomes !== undefined
          ? { learningOutcomes: input.learningOutcomes }
          : {}),
        ...(input.requirements !== undefined ? { requirements: input.requirements } : {}),
        ...(input.isFeatured !== undefined ? { isFeatured: input.isFeatured } : {}),
        ...(becomingPublished && !existing.publishedAt ? { publishedAt: new Date() } : {}),
      },
    });
  });

  if (input.seo) await upsertSeo({ courseId: id }, input.seo);

  return getCourseById(id, { locale, includeUnpublished: true });
}

export async function setCourseStatus(
  id: string,
  status: string,
  locale: string,
): Promise<CourseDetailDto> {
  const course = await prisma.course.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, publishedAt: true, lessonCount: true },
  });
  if (!course) throw new NotFoundError('Course');

  if (status === 'PUBLISHED' && course.lessonCount === 0) {
    throw new BadRequestError('Add at least one published lesson before publishing this course');
  }

  await prisma.course.update({
    where: { id },
    data: {
      status: status as never,
      ...(status === 'PUBLISHED' && !course.publishedAt ? { publishedAt: new Date() } : {}),
    },
  });

  return getCourseById(id, { locale, includeUnpublished: true });
}

/** Soft delete: enrollments and progress stay intact and can be restored. */
export async function deleteCourse(id: string): Promise<void> {
  const course = await prisma.course.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
  if (!course) throw new NotFoundError('Course');

  await prisma.course.update({
    where: { id },
    data: { deletedAt: new Date(), status: 'ARCHIVED' },
  });
}

export async function restoreCourse(id: string): Promise<void> {
  await prisma.course.update({ where: { id }, data: { deletedAt: null, status: 'DRAFT' } });
}

/**
 * Deep-copies a course including modules, lessons and content.
 * Enrollments, progress and counters are intentionally NOT copied — the clone
 * starts as an empty draft.
 */
export async function duplicateCourse(id: string, locale: string): Promise<CourseDetailDto> {
  const source = await prisma.course.findFirst({
    where: { id, deletedAt: null },
    include: {
      modules: { orderBy: { sortOrder: 'asc' }, include: { lessons: { orderBy: { sortOrder: 'asc' } } } },
      tags: true,
      instructors: true,
    },
  });
  if (!source) throw new NotFoundError('Course');

  const slug = await uniqueSlug(
    `${source.slug}-copy`,
    async (candidate) => (await prisma.course.count({ where: { slug: candidate } })) > 0,
    { fallbackPrefix: 'course' },
  );

  const clone = await prisma.course.create({
    data: {
      slug,
      title: `${source.title} (copy)`,
      summary: source.summary,
      description: jsonOrDbNull(source.description),
      thumbnailMediaId: source.thumbnailMediaId,
      categoryId: source.categoryId,
      level: source.level,
      accessType: source.accessType,
      status: 'DRAFT',
      priceCents: source.priceCents,
      currency: source.currency,
      durationMinutes: source.durationMinutes,
      language: source.language,
      learningOutcomes: source.learningOutcomes,
      requirements: source.requirements,
      lessonCount: source.modules.reduce(
        (total, module) => total + module.lessons.filter((lesson) => lesson.isPublished).length,
        0,
      ),
      tags: { create: source.tags.map((tag) => ({ tagId: tag.tagId })) },
      instructors: {
        create: source.instructors.map((entry) => ({
          instructorId: entry.instructorId,
          sortOrder: entry.sortOrder,
        })),
      },
      modules: {
        create: source.modules.map((module) => ({
          title: module.title,
          summary: module.summary,
          sortOrder: module.sortOrder,
          isPublished: module.isPublished,
          lessons: {
            create: module.lessons.map((lesson) => ({
              slug: lesson.slug,
              title: lesson.title,
              summary: lesson.summary,
              type: lesson.type,
              body: jsonOrDbNull(lesson.body),
              videoUrl: lesson.videoUrl,
              videoProvider: lesson.videoProvider,
              videoPosterMediaId: lesson.videoPosterMediaId,
              videoDurationSeconds: lesson.videoDurationSeconds,
              sourcePdfMediaId: lesson.sourcePdfMediaId,
              durationMinutes: lesson.durationMinutes,
              sortOrder: lesson.sortOrder,
              isPreview: lesson.isPreview,
              isPublished: lesson.isPublished,
            })),
          },
        })),
      },
    },
    select: { id: true },
  });

  return getCourseById(clone.id, { locale, includeUnpublished: true });
}

/**
 * Recomputes the denormalised lesson counter and total duration.
 * Called whenever lessons are added, removed, published or reordered.
 */
export async function recalculateCourseAggregates(courseId: string): Promise<void> {
  // Only lessons that a learner can actually reach count towards the total:
  // an unpublished lesson (or one inside an unpublished module) must not
  // inflate the denominator of everyone's progress percentage.
  const lessons = await prisma.lesson.findMany({
    where: { isPublished: true, module: { courseId, isPublished: true } },
    select: { durationMinutes: true },
  });

  const lessonCount = lessons.length;
  const durationMinutes = lessons.reduce((total, lesson) => total + (lesson.durationMinutes ?? 0), 0);

  await prisma.course.update({
    where: { id: courseId },
    data: { lessonCount, ...(durationMinutes > 0 ? { durationMinutes } : {}) },
  });

  // Percentages stored against learners must reflect the new denominator.
  await syncCourseProgressTotals(courseId, lessonCount);
}

async function syncCourseProgressTotals(courseId: string, totalLessons: number): Promise<void> {
  const rows = await prisma.courseProgress.findMany({
    where: { courseId },
    select: { id: true, completedLessons: true },
  });

  if (rows.length === 0) return;

  await prisma.$transaction(
    rows.map((row) =>
      prisma.courseProgress.update({
        where: { id: row.id },
        data: {
          totalLessons,
          progressPercent:
            totalLessons > 0
              ? Math.min(100, Math.round((row.completedLessons / totalLessons) * 100))
              : 0,
        },
      }),
    ),
  );
}
