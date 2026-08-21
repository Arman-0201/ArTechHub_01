import { z } from 'zod';
import { MENU_LINK_TYPE, PUBLISH_STATUS } from '@academy/types';
import {
  cuidSchema,
  httpUrlSchema,
  linkTargetSchema,
  listQuerySchema,
  localeSchema,
  seoSchema,
  slugSchema,
} from './common.js';
import { nullableRichText, pageSectionSchema } from './content.js';

/* --------------------------------------------------------------------- pages */

export const pageStatusSchema = z.enum(PUBLISH_STATUS as unknown as [string, ...string[]]);

export const pageBaseSchema = z.object({
  title: z.string().trim().min(2).max(180),
  slug: slugSchema.optional(),
  status: pageStatusSchema.optional(),
  isEnabled: z.boolean().optional(),
  template: z.enum(['default', 'landing', 'legal', 'full-width']).optional(),
  seo: seoSchema.partial().optional(),
});

export const createPageSchema = pageBaseSchema;
export const updatePageSchema = pageBaseSchema.partial();

export const pageListQuerySchema = listQuerySchema.extend({
  status: pageStatusSchema.optional(),
  isEnabled: z.coerce.boolean().optional(),
});

export const reorderSectionsSchema = z.object({
  sectionIds: z.array(cuidSchema).min(1).max(200),
});

export const createSectionSchema = pageSectionSchema;
export const updateSectionSchema = pageSectionSchema.partial();

/* --------------------------------------------------------------------- menus */

const menuLinkTypeSchema = z.enum(MENU_LINK_TYPE as unknown as [string, ...string[]]);

export const menuItemBaseSchema = z.object({
  label: z.string().trim().min(1).max(80),
  url: linkTargetSchema,
  linkType: menuLinkTypeSchema.optional(),
  target: z.enum(['_self', '_blank']).optional(),
  iconName: z.string().trim().max(64).nullable().optional(),
  parentId: cuidSchema.nullable().optional(),
  sortOrder: z.number().int().min(0).max(10000).optional(),
  isVisible: z.boolean().optional(),
  visibleForRoles: z.array(slugSchema).max(20).optional(),
  visibleForLocales: z.array(localeSchema).max(20).optional(),
});

export const createMenuItemSchema = menuItemBaseSchema;
export const updateMenuItemSchema = menuItemBaseSchema.partial();

/**
 * Drag-and-drop reordering sends the whole tree back: a flat list of
 * (id, parentId, sortOrder) triples that the server re-validates so a client
 * cannot move an item into a menu it does not belong to.
 */
export const reorderMenuSchema = z.object({
  items: z
    .array(
      z.object({
        id: cuidSchema,
        parentId: cuidSchema.nullable(),
        sortOrder: z.number().int().min(0).max(10000),
      }),
    )
    .max(500),
});

export const createMenuSchema = z.object({
  name: z.string().trim().min(2).max(80),
  slug: slugSchema,
  description: z.string().trim().max(300).nullable().optional(),
});

/* -------------------------------------------------------------------- footer */

export const footerGroupSchema = z.object({
  title: z.string().trim().min(1).max(80),
  sortOrder: z.number().int().min(0).max(1000).optional(),
  isVisible: z.boolean().optional(),
});

export const footerLinkSchema = z.object({
  label: z.string().trim().min(1).max(80),
  url: linkTargetSchema,
  target: z.enum(['_self', '_blank']).optional(),
  sortOrder: z.number().int().min(0).max(1000).optional(),
  isVisible: z.boolean().optional(),
});

/* ---------------------------------------------------------------------- blog */

export const blogPostBaseSchema = z.object({
  title: z.string().trim().min(3).max(200),
  slug: slugSchema.optional(),
  excerpt: z.string().trim().max(400).nullable().optional(),
  body: nullableRichText,
  coverMediaId: cuidSchema.nullable().optional(),
  status: pageStatusSchema.optional(),
  publishedAt: z.coerce.date().nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  authorId: cuidSchema.nullable().optional(),
  seo: seoSchema.partial().optional(),
});

export const createBlogPostSchema = blogPostBaseSchema;
export const updateBlogPostSchema = blogPostBaseSchema.partial();

export const blogListQuerySchema = listQuerySchema.extend({
  status: pageStatusSchema.optional(),
  tag: z.string().trim().max(40).optional(),
});

/* -------------------------------------------------------------------- legal */

export const legalDocumentSchema = z.object({
  slug: slugSchema,
  title: z.string().trim().min(2).max(180),
  requiresAcceptance: z.boolean().optional(),
});

export const legalVersionSchema = z.object({
  version: z
    .string()
    .trim()
    .min(1)
    .max(20)
    .regex(/^[0-9]+(\.[0-9]+)*$/, 'Use a numeric version such as 1.0 or 2.1.3'),
  body: nullableRichText,
  effectiveAt: z.coerce.date().optional(),
  publish: z.boolean().optional(),
});

export const acceptLegalSchema = z.object({
  acceptances: z
    .array(z.object({ documentSlug: slugSchema, versionId: cuidSchema }))
    .min(1)
    .max(10),
});

/* ----------------------------------------------------------------- settings */

export const siteSettingsSchema = z.object({
  siteName: z.string().trim().min(1).max(120).optional(),
  siteTagline: z.string().trim().max(200).nullable().optional(),
  siteDescription: z.string().trim().max(600).nullable().optional(),
  logoMediaId: cuidSchema.nullable().optional(),
  logoDarkMediaId: cuidSchema.nullable().optional(),
  faviconMediaId: cuidSchema.nullable().optional(),
  contactEmail: z.string().trim().email().nullable().optional(),
  contactPhone: z.string().trim().max(40).nullable().optional(),
  contactAddress: z.string().trim().max(300).nullable().optional(),
  socialLinks: z
    .array(z.object({ platform: z.string().trim().min(1).max(40), url: httpUrlSchema }))
    .max(15)
    .optional(),
  defaultLocale: localeSchema.optional(),
  maintenanceMode: z.boolean().optional(),
  maintenanceMessage: z.string().trim().max(500).nullable().optional(),
  footerNote: z.string().trim().max(300).nullable().optional(),
  defaultSeo: seoSchema.partial().optional(),
});

/* ------------------------------------------------------------- feature flags */

export const updateFeatureFlagSchema = z.object({
  isEnabled: z.boolean(),
});

/* ----------------------------------------------------------------- languages */

export const languageSchema = z.object({
  code: localeSchema,
  isActive: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(1000).optional(),
});

export const upsertTranslationsSchema = z.object({
  locale: localeSchema,
  namespace: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9_-]+$/, 'Namespaces use lowercase letters, numbers, dashes'),
  entries: z.record(z.string().max(4000)),
});

/* -------------------------------------------------------------- misc public */

export const contactMessageSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email(),
  subject: z.string().trim().min(2).max(160),
  message: z.string().trim().min(10).max(5000),
});

export const newsletterSubscribeSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  locale: localeSchema.optional(),
});

export const searchQuerySchema = z.object({
  q: z.string().trim().min(2, 'Enter at least 2 characters').max(120),
  type: z.enum(['all', 'courses', 'categories', 'blog', 'products']).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(12),
});
