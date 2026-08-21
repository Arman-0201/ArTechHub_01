import { z } from 'zod';
import {
  ACCESS_TYPE,
  COURSE_LEVEL,
  COURSE_STATUS,
  LESSON_TYPE,
  PUBLISH_STATUS,
} from '@academy/types';
import {
  cuidSchema,
  hexColorSchema,
  httpUrlSchema,
  listQuerySchema,
  localeSchema,
  seoSchema,
  slugSchema,
} from './common.js';
import { nullableRichText } from './content.js';

/* ---------------------------------------------------------------- categories */

export const categoryBaseSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: slugSchema.optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  iconName: z.string().trim().max(64).nullable().optional(),
  imageMediaId: cuidSchema.nullable().optional(),
  colorHex: hexColorSchema.nullable().optional(),
  parentId: cuidSchema.nullable().optional(),
  sortOrder: z.number().int().min(0).max(10000).optional(),
  isActive: z.boolean().optional(),
  seo: seoSchema.partial().optional(),
});

export const createCategorySchema = categoryBaseSchema;
export const updateCategorySchema = categoryBaseSchema.partial();

export const categoryListQuerySchema = listQuerySchema.extend({
  parentId: cuidSchema.nullable().optional(),
  isActive: z.coerce.boolean().optional(),
  tree: z.coerce.boolean().optional(),
});

/* ------------------------------------------------------------------- courses */

export const courseLevelSchema = z.enum(COURSE_LEVEL as unknown as [string, ...string[]]);
export const courseStatusSchema = z.enum(COURSE_STATUS as unknown as [string, ...string[]]);
export const courseAccessSchema = z.enum(ACCESS_TYPE as unknown as [string, ...string[]]);
export const lessonTypeSchema = z.enum(LESSON_TYPE as unknown as [string, ...string[]]);
export const publishStatusSchema = z.enum(PUBLISH_STATUS as unknown as [string, ...string[]]);

export const courseBaseSchema = z.object({
  title: z.string().trim().min(3).max(180),
  slug: slugSchema.optional(),
  summary: z.string().trim().max(400).nullable().optional(),
  description: nullableRichText,
  thumbnailMediaId: cuidSchema.nullable().optional(),
  categoryId: cuidSchema.nullable().optional(),
  level: courseLevelSchema.optional(),
  accessType: courseAccessSchema.optional(),
  priceCents: z.number().int().min(0).max(100_000_00).nullable().optional(),
  currency: z.string().trim().length(3).toUpperCase().nullable().optional(),
  durationMinutes: z.number().int().min(0).max(100000).nullable().optional(),
  language: localeSchema.optional(),
  learningOutcomes: z.array(z.string().trim().min(1).max(300)).max(30).optional(),
  requirements: z.array(z.string().trim().min(1).max(300)).max(30).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(25).optional(),
  instructorIds: z.array(cuidSchema).max(10).optional(),
  isFeatured: z.boolean().optional(),
  status: courseStatusSchema.optional(),
  seo: seoSchema.partial().optional(),
});

export const createCourseSchema = courseBaseSchema;
export const updateCourseSchema = courseBaseSchema.partial();

export const courseListQuerySchema = listQuerySchema.extend({
  category: slugSchema.optional(),
  categoryId: cuidSchema.optional(),
  level: courseLevelSchema.optional(),
  access: courseAccessSchema.optional(),
  status: courseStatusSchema.optional(),
  tag: z.string().trim().max(40).optional(),
  instructor: slugSchema.optional(),
  featured: z.coerce.boolean().optional(),
});

export const publishCourseSchema = z.object({
  status: courseStatusSchema,
});

/* ------------------------------------------------------------------- modules */

export const moduleBaseSchema = z.object({
  title: z.string().trim().min(2).max(180),
  summary: z.string().trim().max(600).nullable().optional(),
  sortOrder: z.number().int().min(0).max(10000).optional(),
  isPublished: z.boolean().optional(),
});

export const createModuleSchema = moduleBaseSchema;
export const updateModuleSchema = moduleBaseSchema.partial();

/* ------------------------------------------------------------------- lessons */

export const lessonVideoSchema = z.object({
  url: z.string().trim().min(1).max(2048),
  provider: z.enum(['file', 'youtube', 'vimeo']).default('file'),
  posterMediaId: cuidSchema.nullable().optional(),
  durationSeconds: z.number().int().min(0).max(86400).nullable().optional(),
});

export const lessonBaseSchema = z.object({
  title: z.string().trim().min(2).max(180),
  slug: slugSchema.optional(),
  summary: z.string().trim().max(600).nullable().optional(),
  type: lessonTypeSchema.optional(),
  body: nullableRichText,
  video: lessonVideoSchema.nullable().optional(),
  durationMinutes: z.number().int().min(0).max(1000).nullable().optional(),
  sortOrder: z.number().int().min(0).max(10000).optional(),
  isPreview: z.boolean().optional(),
  isPublished: z.boolean().optional(),
  sourcePdfMediaId: cuidSchema.nullable().optional(),
  attachmentMediaIds: z.array(cuidSchema).max(20).optional(),
});

export const createLessonSchema = lessonBaseSchema.extend({ moduleId: cuidSchema });
export const updateLessonSchema = lessonBaseSchema.partial();

/* ---------------------------------------------------------------- enrollment */

export const enrollSchema = z.object({ courseId: cuidSchema });

export const lessonProgressSchema = z.object({
  isCompleted: z.boolean().optional(),
  lastPositionSeconds: z.number().int().min(0).max(86400).optional(),
});

/* --------------------------------------------------------------- instructors */

export const instructorBaseSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: slugSchema.optional(),
  userId: cuidSchema.nullable().optional(),
  headline: z.string().trim().max(160).nullable().optional(),
  bio: z.string().trim().max(3000).nullable().optional(),
  avatarMediaId: cuidSchema.nullable().optional(),
  links: z
    .array(z.object({ label: z.string().trim().min(1).max(40), url: httpUrlSchema }))
    .max(8)
    .optional(),
  isActive: z.boolean().optional(),
});

export const createInstructorSchema = instructorBaseSchema;
export const updateInstructorSchema = instructorBaseSchema.partial();
