import { z } from 'zod';
import { LOCALE_CODES } from '@academy/types';

/** Trims, then treats an empty string as "not provided". */
export const optionalTrimmedString = z
  .string()
  .trim()
  .transform((value) => (value.length === 0 ? undefined : value))
  .optional();

export const nullableTrimmedString = z
  .string()
  .trim()
  .transform((value) => (value.length === 0 ? null : value))
  .nullable()
  .optional();

export const cuidSchema = z.string().min(1, 'Identifier is required').max(64);

export const idParamSchema = z.object({ id: cuidSchema });

/**
 * Slugs are the public URL surface for courses, pages and products.
 * Restricting the character set keeps routing unambiguous and prevents
 * path-traversal style values from ever reaching a filesystem or a redirect.
 */
export const slugSchema = z
  .string()
  .trim()
  .min(1, 'Slug is required')
  .max(160)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and single hyphens');

export const slugParamSchema = z.object({ slug: slugSchema });

export const localeSchema = z.enum(LOCALE_CODES as [string, ...string[]]);

export const hexColorSchema = z
  .string()
  .trim()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Enter a valid hex colour');

/**
 * Only http(s) URLs are accepted anywhere a URL is stored, so a stored value can
 * never become a `javascript:` or `data:` link when rendered into an href.
 */
export const httpUrlSchema = z
  .string()
  .trim()
  .url('Enter a valid URL')
  .refine((value) => /^https?:\/\//i.test(value), 'Only http and https URLs are allowed');

/** Accepts either an absolute http(s) URL or a site-relative path. */
export const linkTargetSchema = z
  .string()
  .trim()
  .min(1, 'A link is required')
  .max(2048)
  .refine(
    (value) => /^https?:\/\//i.test(value) || value.startsWith('/') || value.startsWith('#'),
    'Use an absolute http(s) URL or a path beginning with /',
  );

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const listQuerySchema = paginationSchema.extend({
  search: z.string().trim().max(160).optional(),
  sort: z
    .string()
    .trim()
    .max(64)
    .regex(/^[a-zA-Z0-9_.]+$/, 'Invalid sort field')
    .optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export type ListQueryInput = z.infer<typeof listQuerySchema>;

export const sortOrderItemsSchema = z.object({
  items: z
    .array(z.object({ id: cuidSchema, sortOrder: z.number().int().min(0).max(100000) }))
    .min(1, 'Provide at least one item')
    .max(500),
});

export const booleanQuerySchema = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((value) => value === true || value === 'true' || value === '1');

export const seoSchema = z.object({
  title: nullableTrimmedString.pipe(z.string().max(180).nullable().optional()),
  description: nullableTrimmedString.pipe(z.string().max(400).nullable().optional()),
  keywords: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
  canonicalUrl: httpUrlSchema.nullable().optional(),
  ogTitle: nullableTrimmedString.pipe(z.string().max(180).nullable().optional()),
  ogDescription: nullableTrimmedString.pipe(z.string().max(400).nullable().optional()),
  ogImageUrl: httpUrlSchema.nullable().optional(),
  twitterCard: z.enum(['summary', 'summary_large_image']).nullable().optional(),
  robots: z
    .string()
    .trim()
    .max(120)
    .regex(/^[a-z,\s-]*$/i, 'Invalid robots directive')
    .nullable()
    .optional(),
  structuredData: z.record(z.unknown()).nullable().optional(),
});

export type SeoInput = z.infer<typeof seoSchema>;
