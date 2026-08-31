import { Router } from 'express';
import {
  blogListQuerySchema,
  categoryListQuerySchema,
  contactMessageSchema,
  courseListQuerySchema,
  idParamSchema,
  newsletterSubscribeSchema,
  productListQuerySchema,
  searchQuerySchema,
  slugParamSchema,
  slugSchema,
} from '@academy/validation';
import { z } from 'zod';
import { FEATURE_KEYS } from '@academy/types';
import { asyncHandler, getClientIp, ok } from '../lib/http.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validate.js';
import { optionalAuth } from '../middleware/authenticate.js';
import { requireFeature } from '../middleware/feature-gate.js';
import { pdfStreamLimiter, publicFormLimiter, searchLimiter } from '../middleware/rate-limit.js';
import { sendRangeStream } from '../lib/range.js';
import { openObjectStream } from '../lib/storage.js';
import { prisma } from '../lib/prisma.js';
import { getSiteBootstrap } from '../modules/settings/bootstrap.service.js';
import { getActiveLanguages, getTranslations } from '../modules/languages/languages.service.js';
import * as categoriesService from '../modules/categories/categories.service.js';
import * as collectionsService from '../modules/collections/collections.service.js';
import * as coursesService from '../modules/courses/courses.service.js';
import * as instructorsService from '../modules/courses/instructors.service.js';
import * as lessonsService from '../modules/lessons/lessons.service.js';
import * as mediaService from '../modules/media/media.service.js';
import * as pagesService from '../modules/pages/pages.service.js';
import * as blogService from '../modules/blog/blog.service.js';
import * as searchService from '../modules/search/search.service.js';
import * as legalService from '../modules/legal/legal.service.js';
import * as commerceService from '../modules/ecommerce/ecommerce.service.js';
import { buildSitemapEntries, getSeoByRoute } from '../modules/seo/seo.service.js';
import { getFeatureFlags, isFeatureEnabled } from '../modules/feature-flags/feature-flags.service.js';
import { PERMISSIONS, REALTIME_RESOURCES } from '@academy/types';
import { announceVisitorActivity } from '../realtime/events.js';
import { checkoutSchema } from '@academy/validation';

/**
 * Public API.
 *
 * `optionalAuth` runs on the whole router: these endpoints are readable by
 * anonymous visitors but personalise their response when a session exists
 * (enrollment badges, role-filtered menus, preview access to draft lessons for
 * staff). Nothing here trusts the session for authorisation — the services do
 * their own checks.
 */
export const publicRouter: Router = Router();

publicRouter.use(optionalAuth);

/* ------------------------------------------------------------------ site */

publicRouter.get(
  '/site/bootstrap',
  asyncHandler(async (req, res) => {
    ok(
      res,
      await getSiteBootstrap({ locale: req.locale, roleSlugs: req.user?.roleSlugs ?? [] }),
    );
  }),
);

publicRouter.get(
  '/site/languages',
  asyncHandler(async (_req, res) => ok(res, await getActiveLanguages())),
);

publicRouter.get(
  '/site/translations/:locale',
  asyncHandler(async (req, res) => {
    ok(res, await getTranslations(req.params.locale ?? 'en'));
  }),
);

publicRouter.get(
  '/site/features',
  asyncHandler(async (_req, res) => ok(res, await getFeatureFlags())),
);

publicRouter.get(
  '/site/sitemap',
  asyncHandler(async (_req, res) => ok(res, await buildSitemapEntries())),
);

publicRouter.get(
  '/site/seo/route/:key',
  asyncHandler(async (req, res) => ok(res, await getSeoByRoute(req.params.key ?? ''))),
);

/* -------------------------------------------------------------- catalogue */

publicRouter.get(
  '/categories',
  validateQuery(categoryListQuerySchema),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as z.infer<typeof categoryListQuerySchema>;
    ok(
      res,
      await categoriesService.listCategories({
        locale: req.locale,
        // The public catalogue only ever shows active categories.
        isActive: true,
        tree: query.tree ?? true,
        search: query.search,
      }),
    );
  }),
);

publicRouter.get(
  '/categories/:slug',
  validateParams(slugParamSchema),
  asyncHandler(async (req, res) => {
    ok(res, await categoriesService.getCategoryBySlug(req.params.slug!, req.locale));
  }),
);

publicRouter.get(
  '/courses',
  validateQuery(courseListQuerySchema),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as z.infer<typeof courseListQuerySchema>;
    const result = await coursesService.listCourses({
      ...query,
      locale: req.locale,
      includeUnpublished: false,
    });
    ok(res, result.items, 200, result.meta);
  }),
);

publicRouter.get(
  '/courses/featured',
  asyncHandler(async (req, res) => {
    const limit = Number.parseInt(String(req.query.limit ?? '6'), 10);
    ok(res, await coursesService.listFeaturedCourses(req.locale, Number.isFinite(limit) ? limit : 6));
  }),
);

publicRouter.get(
  '/courses/:slug',
  validateParams(slugParamSchema),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await coursesService.getCourseBySlug(req.params.slug!, {
        locale: req.locale,
        viewerId: req.user?.id,
        // Staff can preview a draft course from its public URL.
        includeUnpublished: Boolean(
          req.user?.isSuperAdmin || req.user?.permissions.has(PERMISSIONS.COURSES_UPDATE),
        ),
      }),
    );
  }),
);

publicRouter.get(
  '/courses/:slug/lessons/:lessonSlug',
  asyncHandler(async (req, res) => {
    ok(
      res,
      await lessonsService.getLessonBySlug(req.params.slug!, req.params.lessonSlug!, {
        locale: req.locale,
        viewer: req.user
          ? {
              id: req.user.id,
              canManageCourses:
                req.user.isSuperAdmin || req.user.permissions.has(PERMISSIONS.COURSES_UPDATE),
            }
          : undefined,
      }),
    );
  }),
);

/**
 * Lesson PDF stream — what the in-page reader reads from.
 *
 * Three gates, in the order a request meets them:
 *   1. the feature flag, so an operator can withdraw in-browser reading
 *      platform-wide from the admin panel and have the route stop existing;
 *   2. the same lesson access check the body goes through, so the bytes are no
 *      more reachable than the lesson they belong to;
 *   3. its own rate limit, because one open document legitimately issues many
 *      range requests and would otherwise eat the global allowance.
 */
publicRouter.get(
  '/courses/:slug/lessons/:lessonSlug/pdf',
  requireFeature(FEATURE_KEYS.PDF_READER),
  pdfStreamLimiter,
  asyncHandler(async (req, res) => {
    const source = await lessonsService.getLessonPdfSource(
      req.params.slug!,
      req.params.lessonSlug!,
      req.user
        ? {
            id: req.user.id,
            canManageCourses:
              req.user.isSuperAdmin || req.user.permissions.has(PERMISSIONS.COURSES_UPDATE),
          }
        : undefined,
    );

    await sendRangeStream(req, res, {
      sizeBytes: source.sizeBytes,
      mimeType: source.mimeType,
      fileName: source.fileName,
      open: (range) => openObjectStream(source.storageKey, source.storageDriver, range),
    });
  }),
);

publicRouter.get(
  '/instructors',
  requireFeature(FEATURE_KEYS.INSTRUCTORS),
  asyncHandler(async (_req, res) => ok(res, await instructorsService.listInstructors())),
);

publicRouter.get(
  '/instructors/:slug',
  requireFeature(FEATURE_KEYS.INSTRUCTORS),
  validateParams(slugParamSchema),
  asyncHandler(async (req, res) => {
    const instructor = await instructorsService.getInstructorBySlug(req.params.slug!);
    const courses = await coursesService.listCourses({
      locale: req.locale,
      page: 1,
      pageSize: 24,
      order: 'desc',
      instructor: req.params.slug!,
    });
    ok(res, { instructor, courses: courses.items });
  }),
);

/* -------------------------------------------------------------- documents */

/**
 * Library PDF stream — what the page-section gallery's reader reads from.
 *
 * The lesson equivalent above is access-controlled per learner; this one serves
 * documents an editor has deliberately published on a CMS page, so there is
 * nothing to authorise. What it shares is the part that matters to the reader:
 * `Range` support, so pdf.js paints page one while the rest of the file is
 * still arriving, and a same-origin path, so the app's CSP and the browser's
 * cookie rules both stay out of the way.
 *
 * The service decides what may be served — PDFs only, and nothing attached to
 * a lesson. The rate limit is the shared document-stream bucket, sized for one
 * reader opening several documents rather than for someone walking ids.
 */
publicRouter.get(
  '/documents/:id',
  pdfStreamLimiter,
  validateParams(idParamSchema),
  asyncHandler(async (req, res) => {
    const source = await mediaService.getPublicDocumentSource(req.params.id!);

    await sendRangeStream(req, res, {
      sizeBytes: source.sizeBytes,
      mimeType: source.mimeType,
      fileName: source.fileName,
      open: (range) => openObjectStream(source.storageKey, source.storageDriver, range),
    });
  }),
);

/* ------------------------------------------------------------------ pages */

publicRouter.get(
  '/pages/:slug',
  validateParams(slugParamSchema),
  asyncHandler(async (req, res) => {
    ok(res, await pagesService.getPublicPage(req.params.slug!, req.locale));
  }),
);

/* ------------------------------------------------------------------- blog */

publicRouter.get(
  '/blog',
  requireFeature(FEATURE_KEYS.BLOG),
  validateQuery(blogListQuerySchema),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as z.infer<typeof blogListQuerySchema>;
    const result = await blogService.listPosts({ ...query, locale: req.locale });
    ok(res, result.items, 200, result.meta);
  }),
);

publicRouter.get(
  '/blog/tags',
  requireFeature(FEATURE_KEYS.BLOG),
  asyncHandler(async (_req, res) => ok(res, await blogService.listBlogTags())),
);

publicRouter.get(
  '/blog/:slug',
  requireFeature(FEATURE_KEYS.BLOG),
  validateParams(slugParamSchema),
  asyncHandler(async (req, res) => {
    ok(res, await blogService.getPostBySlug(req.params.slug!, req.locale));
  }),
);

/* ----------------------------------------------------- reference collections */

/**
 * An index returns its entries whole rather than a page at a time.
 *
 * The grid searches and filters in the browser — which is what makes typing
 * feel instant and lets the same component be dropped onto any CMS page — so a
 * paginated response would only mean the search could not see past page one.
 * The service caps how many rows that can be.
 */

publicRouter.get(
  '/collections',
  asyncHandler(async (_req, res) => ok(res, await collectionsService.listPublicCollections())),
);

publicRouter.get(
  '/collections/:slug',
  validateParams(slugParamSchema),
  asyncHandler(async (req, res) =>
    ok(res, await collectionsService.getPublicCollection(req.params.slug!)),
  ),
);

publicRouter.get(
  '/collections/:slug/entries/:entrySlug',
  validateParams(z.object({ slug: slugSchema, entrySlug: slugSchema })),
  asyncHandler(async (req, res) =>
    ok(res, await collectionsService.getPublicEntry(req.params.slug!, req.params.entrySlug!)),
  ),
);

/* ----------------------------------------------------------------- search */

publicRouter.get(
  '/search',
  requireFeature(FEATURE_KEYS.SEARCH),
  searchLimiter,
  validateQuery(searchQuerySchema),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as z.infer<typeof searchQuerySchema>;
    const [shopEnabled, blogEnabled] = await Promise.all([
      isFeatureEnabled(FEATURE_KEYS.SHOP),
      isFeatureEnabled(FEATURE_KEYS.BLOG),
    ]);
    const result = await searchService.search({
      query: query.q,
      scope: query.type,
      page: query.page,
      pageSize: query.pageSize,
      shopEnabled,
      blogEnabled,
    });
    ok(res, { items: result.items, counts: result.counts }, 200, result.meta);
  }),
);

publicRouter.get(
  '/search/suggest',
  requireFeature(FEATURE_KEYS.SEARCH),
  searchLimiter,
  asyncHandler(async (req, res) => {
    ok(res, await searchService.suggest(String(req.query.q ?? '')));
  }),
);

/* ------------------------------------------------------------------ legal */

publicRouter.get(
  '/legal',
  asyncHandler(async (_req, res) => ok(res, await legalService.listLegalDocuments())),
);

publicRouter.get(
  '/legal/:slug',
  validateParams(slugParamSchema),
  asyncHandler(async (req, res) => ok(res, await legalService.getLegalDocument(req.params.slug!))),
);

/* ------------------------------------------------------------------- shop */

publicRouter.get(
  '/shop/products',
  requireFeature(FEATURE_KEYS.SHOP),
  validateQuery(productListQuerySchema),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as z.infer<typeof productListQuerySchema>;
    const result = await commerceService.listProducts({ ...query, includeInactive: false });
    ok(res, result.items, 200, result.meta);
  }),
);

publicRouter.get(
  '/shop/categories',
  requireFeature(FEATURE_KEYS.SHOP),
  asyncHandler(async (_req, res) => ok(res, await commerceService.listProductCategories())),
);

publicRouter.get(
  '/shop/products/:slug',
  requireFeature(FEATURE_KEYS.SHOP),
  validateParams(slugParamSchema),
  asyncHandler(async (req, res) => ok(res, await commerceService.getProductBySlug(req.params.slug!))),
);

const cartPriceSchema = z.object({
  lines: z
    .array(z.object({ productId: z.string().min(1), quantity: z.number().int().min(1).max(99) }))
    .max(50),
});

publicRouter.post(
  '/shop/cart/price',
  requireFeature(FEATURE_KEYS.SHOP),
  validateBody(cartPriceSchema),
  asyncHandler(async (req, res) => {
    // Totals are always computed here, never accepted from the client.
    const { lines } = req.body as z.infer<typeof cartPriceSchema>;
    ok(res, await commerceService.priceCart(lines));
  }),
);

publicRouter.post(
  '/shop/checkout',
  requireFeature(FEATURE_KEYS.SHOP),
  publicFormLimiter,
  validateBody(checkoutSchema),
  asyncHandler(async (req, res) => {
    const input = req.body as z.infer<typeof checkoutSchema>;
    const order = await commerceService.createOrder({
      userId: req.user?.id ?? null,
      lines: input.lines,
      customer: input.customer,
      shippingAddress: input.shippingAddress,
      notes: input.notes,
    });
    ok(res, order, 201);
  }),
);

/* ------------------------------------------------------- contact and news */

publicRouter.post(
  '/contact',
  requireFeature(FEATURE_KEYS.CONTACT_FORM),
  publicFormLimiter,
  validateBody(contactMessageSchema),
  asyncHandler(async (req, res) => {
    const input = req.body as z.infer<typeof contactMessageSchema>;
    await prisma.contactMessage.create({
      data: { ...input, ipAddress: getClientIp(req) ?? null },
    });
    // The inbox is only useful if it fills while someone is looking at it. No
    // sender name or address travels with the event — an admin holding
    // `settings.manage` is told the inbox moved and reads it through the
    // endpoint that has always guarded it.
    announceVisitorActivity([REALTIME_RESOURCES.MESSAGES]);
    ok(res, { message: 'Thanks for reaching out. We will reply shortly.' }, 201);
  }),
);

publicRouter.post(
  '/newsletter/subscribe',
  requireFeature(FEATURE_KEYS.NEWSLETTER),
  publicFormLimiter,
  validateBody(newsletterSubscribeSchema),
  asyncHandler(async (req, res) => {
    const input = req.body as z.infer<typeof newsletterSubscribeSchema>;
    await prisma.newsletterSubscriber.upsert({
      where: { email: input.email },
      create: { email: input.email, locale: input.locale ?? req.locale },
      // Re-subscribing clears a previous opt-out rather than erroring.
      update: { unsubscribedAt: null, locale: input.locale ?? req.locale },
    });
    announceVisitorActivity([REALTIME_RESOURCES.MESSAGES]);
    ok(res, { message: 'You are on the list. Check your inbox to confirm.' }, 201);
  }),
);
