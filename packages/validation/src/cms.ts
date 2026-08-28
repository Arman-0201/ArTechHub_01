import { z } from 'zod';
import {
  COLLECTION_PANEL_COLUMNS,
  COLLECTION_PANEL_KINDS,
  COLLECTION_TONES,
  MENU_LINK_TYPE,
  PUBLISH_STATUS,
} from '@academy/types';
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

/* -------------------------------------------------------- reference collections */

const collectionToneSchema = z.enum(COLLECTION_TONES as unknown as [string, ...string[]]);

export const collectionBaseSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: slugSchema.optional(),
  description: z.string().trim().max(600).nullable().optional(),
  iconName: z.string().trim().max(64).nullable().optional(),
  eyebrow: z.string().trim().max(80).nullable().optional(),
  searchPlaceholder: z.string().trim().max(120).nullable().optional(),
  status: pageStatusSchema.optional(),
  sortOrder: z.number().int().min(0).max(10000).optional(),
});

export const createCollectionSchema = collectionBaseSchema;
export const updateCollectionSchema = collectionBaseSchema.partial();

export const collectionCategorySchema = z.object({
  name: z.string().trim().min(1).max(80),
  slug: slugSchema.optional(),
  sortOrder: z.number().int().min(0).max(10000).optional(),
});

/**
 * One panel of an entry's detail page.
 *
 * Every shape's fields are present on every panel and default to empty, so
 * switching a panel's kind in the editor never loses what was typed into the
 * other shapes — the renderer reads only the field its kind names.
 */
export const collectionPanelSchema = z.object({
  id: z.string().trim().min(1).max(64),
  kind: z.enum(COLLECTION_PANEL_KINDS as unknown as [string, ...string[]]),
  column: z.enum(COLLECTION_PANEL_COLUMNS as unknown as [string, ...string[]]).default('MAIN'),
  tone: collectionToneSchema.default('DEFAULT'),
  title: z.string().trim().max(160).default(''),
  iconName: z.string().trim().max(64).nullable().default(null),
  body: z.string().trim().max(20_000).nullable().default(null),
  items: z.array(z.string().trim().min(1).max(400)).max(60).default([]),
  facts: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(80),
        value: z.string().trim().max(300).default(''),
      }),
    )
    .max(40)
    .default([]),
  table: z
    .object({
      columns: z.array(z.string().trim().max(80)).min(1).max(8),
      rows: z.array(z.array(z.string().trim().max(1000)).max(8)).max(100),
    })
    .nullable()
    .default(null),
  links: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(120),
        sublabel: z.string().trim().max(120).nullable().default(null),
        href: linkTargetSchema,
        badge: z.string().trim().max(24).nullable().default(null),
        tone: collectionToneSchema.default('DEFAULT'),
      }),
    )
    .max(40)
    .default([]),
});

export const collectionEntryBaseSchema = z.object({
  title: z.string().trim().min(1).max(160),
  slug: slugSchema.optional(),
  subtitle: z.string().trim().max(120).nullable().optional(),
  summary: z.string().trim().max(600).nullable().optional(),
  badge: z.string().trim().max(24).nullable().optional(),
  tone: collectionToneSchema.optional(),
  categoryId: cuidSchema.nullable().optional(),
  isFeatured: z.boolean().optional(),
  status: pageStatusSchema.optional(),
  sortOrder: z.number().int().min(0).max(100_000).optional(),
  /** Extra words the index search matches on — aliases, protocol names, synonyms. */
  keywords: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  facts: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(80),
        value: z.string().trim().max(300).default(''),
      }),
    )
    .max(20)
    .optional(),
  panels: z.array(collectionPanelSchema).max(30).optional(),
});

export const createCollectionEntrySchema = collectionEntryBaseSchema;
export const updateCollectionEntrySchema = collectionEntryBaseSchema.partial();

export const collectionEntryListQuerySchema = listQuerySchema.extend({
  status: pageStatusSchema.optional(),
  categoryId: cuidSchema.optional(),
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
