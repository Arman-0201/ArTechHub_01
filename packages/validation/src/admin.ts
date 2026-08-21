import { z } from 'zod';
import { ALL_PERMISSIONS, MEDIA_KIND, ORDER_STATUS, PRODUCT_TYPE, USER_STATUS } from '@academy/types';
import {
  cuidSchema,
  listQuerySchema,
  localeSchema,
  seoSchema,
  slugSchema,
} from './common.js';
import { nullableRichText } from './content.js';
import { emailSchema, nameSchema, passwordSchema } from './auth.js';

/* --------------------------------------------------------------------- users */

export const userStatusSchema = z.enum(USER_STATUS as unknown as [string, ...string[]]);

export const adminCreateUserSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  roleIds: z.array(cuidSchema).min(1, 'Assign at least one role').max(10),
  status: userStatusSchema.optional(),
  locale: localeSchema.optional(),
  markEmailVerified: z.boolean().default(false),
});

export const adminUpdateUserSchema = z.object({
  name: nameSchema.optional(),
  email: emailSchema.optional(),
  status: userStatusSchema.optional(),
  locale: localeSchema.optional(),
  headline: z.string().trim().max(160).nullable().optional(),
  bio: z.string().trim().max(2000).nullable().optional(),
  emailVerified: z.boolean().optional(),
});

export const assignRolesSchema = z.object({
  roleIds: z.array(cuidSchema).max(10),
});

export const userListQuerySchema = listQuerySchema.extend({
  status: userStatusSchema.optional(),
  role: slugSchema.optional(),
  verified: z.coerce.boolean().optional(),
});

/**
 * Deleting a learner destroys progress and legal-acceptance records, so the
 * admin has to pick a strategy explicitly rather than getting one by default.
 */
export const deleteUserSchema = z.object({
  strategy: z.enum(['deactivate', 'anonymize', 'purge']).default('deactivate'),
  reason: z.string().trim().max(500).optional(),
});

/* --------------------------------------------------------------------- roles */

export const permissionSchema = z.enum(ALL_PERMISSIONS as unknown as [string, ...string[]]);

export const roleBaseSchema = z.object({
  name: z.string().trim().min(2).max(60),
  slug: slugSchema.optional(),
  description: z.string().trim().max(300).nullable().optional(),
  permissions: z.array(permissionSchema).max(ALL_PERMISSIONS.length).optional(),
});

export const createRoleSchema = roleBaseSchema;
export const updateRoleSchema = roleBaseSchema.partial();

/* --------------------------------------------------------------------- media */

export const mediaKindSchema = z.enum(MEDIA_KIND as unknown as [string, ...string[]]);

export const mediaListQuerySchema = listQuerySchema.extend({
  kind: mediaKindSchema.optional(),
  folder: z.string().trim().max(120).optional(),
});

export const updateMediaSchema = z.object({
  altText: z.string().trim().max(300).nullable().optional(),
  folder: z
    .string()
    .trim()
    .max(120)
    .regex(/^[a-z0-9/_-]*$/, 'Folders use lowercase letters, numbers, slashes and dashes')
    .nullable()
    .optional(),
});

/* ----------------------------------------------------------------- pdf import */

export const pdfImportSchema = z.object({
  mediaId: cuidSchema,
  /** Keep the uploaded PDF downloadable alongside the converted lesson. */
  keepOriginal: z.boolean().default(true),
  /** Split the extracted document into one lesson per detected top-level heading. */
  splitByHeadings: z.boolean().default(false),
  moduleId: cuidSchema.optional(),
  titleOverride: z.string().trim().max(180).optional(),
});

/* ------------------------------------------------------------------ commerce */

export const productTypeSchema = z.enum(PRODUCT_TYPE as unknown as [string, ...string[]]);
export const orderStatusSchema = z.enum(ORDER_STATUS as unknown as [string, ...string[]]);

export const productBaseSchema = z.object({
  name: z.string().trim().min(2).max(180),
  slug: slugSchema.optional(),
  summary: z.string().trim().max(400).nullable().optional(),
  description: nullableRichText,
  type: productTypeSchema.optional(),
  priceCents: z.number().int().min(0).max(100_000_00),
  compareAtPriceCents: z.number().int().min(0).max(100_000_00).nullable().optional(),
  currency: z.string().trim().length(3).toUpperCase().optional(),
  stock: z.number().int().min(0).max(1_000_000).nullable().optional(),
  isActive: z.boolean().optional(),
  categoryId: cuidSchema.nullable().optional(),
  imageMediaIds: z.array(cuidSchema).max(10).optional(),
  seo: seoSchema.partial().optional(),
});

export const createProductSchema = productBaseSchema;
export const updateProductSchema = productBaseSchema.partial();

export const productListQuerySchema = listQuerySchema.extend({
  category: slugSchema.optional(),
  type: productTypeSchema.optional(),
  isActive: z.coerce.boolean().optional(),
});

export const cartLineSchema = z.object({
  productId: cuidSchema,
  quantity: z.number().int().min(1).max(99),
});

export const checkoutSchema = z.object({
  lines: z.array(cartLineSchema).min(1, 'Your cart is empty').max(50),
  customer: z.object({
    name: nameSchema,
    email: emailSchema,
    phone: z.string().trim().max(40).optional(),
  }),
  shippingAddress: z
    .object({
      line1: z.string().trim().min(2).max(160),
      line2: z.string().trim().max(160).optional(),
      city: z.string().trim().min(1).max(80),
      postalCode: z.string().trim().min(1).max(20),
      country: z.string().trim().length(2).toUpperCase(),
    })
    .optional(),
  notes: z.string().trim().max(1000).optional(),
});

export const updateOrderStatusSchema = z.object({
  status: orderStatusSchema,
  note: z.string().trim().max(500).optional(),
});

export const orderListQuerySchema = listQuerySchema.extend({
  status: orderStatusSchema.optional(),
});

/* ---------------------------------------------------------------- audit logs */

export const auditListQuerySchema = listQuerySchema.extend({
  action: z.string().trim().max(80).optional(),
  actorId: cuidSchema.optional(),
  targetType: z.string().trim().max(60).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
