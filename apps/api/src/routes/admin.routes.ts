import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { PERMISSIONS } from '@academy/types';
import {
  adminCreateUserSchema,
  adminUpdateUserSchema,
  assignRolesSchema,
  auditListQuerySchema,
  blogListQuerySchema,
  categoryListQuerySchema,
  courseListQuerySchema,
  createBlogPostSchema,
  createCategorySchema,
  createCourseSchema,
  createInstructorSchema,
  createLessonSchema,
  createMenuItemSchema,
  createMenuSchema,
  createModuleSchema,
  createPageSchema,
  createProductSchema,
  createRoleSchema,
  createSectionSchema,
  deleteUserSchema,
  footerGroupSchema,
  footerLinkSchema,
  languageSchema,
  legalDocumentSchema,
  legalVersionSchema,
  listQuerySchema,
  mediaListQuerySchema,
  orderListQuerySchema,
  pageListQuerySchema,
  paginationSchema,
  pdfImportSchema,
  productListQuerySchema,
  publishCourseSchema,
  reorderMenuSchema,
  reorderSectionsSchema,
  siteSettingsSchema,
  sortOrderItemsSchema,
  updateBlogPostSchema,
  updateCategorySchema,
  updateCourseSchema,
  updateFeatureFlagSchema,
  updateInstructorSchema,
  updateLessonSchema,
  updateMediaSchema,
  updateMenuItemSchema,
  updateModuleSchema,
  updateOrderStatusSchema,
  updatePageSchema,
  updateProductSchema,
  updateRoleSchema,
  updateSectionSchema,
  upsertTranslationsSchema,
  userListQuerySchema,
} from '@academy/validation';
import { env } from '../config/env.js';
import { asyncHandler, noContent, ok } from '../lib/http.js';
import { BadRequestError } from '../lib/errors.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import {
  authenticate,
  requireAdminAccess,
  requirePermissions,
} from '../middleware/authenticate.js';
import { uploadLimiter } from '../middleware/rate-limit.js';
import { AUDIT_ACTIONS, listAuditLogs, recordAudit } from '../modules/audit/audit.service.js';
import * as usersService from '../modules/users/users.service.js';
import * as rolesService from '../modules/roles/roles.service.js';
import * as categoriesService from '../modules/categories/categories.service.js';
import * as coursesService from '../modules/courses/courses.service.js';
import * as instructorsService from '../modules/courses/instructors.service.js';
import * as lessonsService from '../modules/lessons/lessons.service.js';
import * as enrollmentsService from '../modules/enrollments/enrollments.service.js';
import * as pagesService from '../modules/pages/pages.service.js';
import * as menusService from '../modules/menus/menus.service.js';
import * as mediaService from '../modules/media/media.service.js';
import * as blogService from '../modules/blog/blog.service.js';
import * as legalService from '../modules/legal/legal.service.js';
import * as commerceService from '../modules/ecommerce/ecommerce.service.js';
import * as languagesService from '../modules/languages/languages.service.js';
import * as settingsService from '../modules/settings/settings.service.js';
import * as featureFlagsService from '../modules/feature-flags/feature-flags.service.js';
import * as analyticsService from '../modules/analytics/analytics.service.js';
import * as pdfImportService from '../modules/content/pdf-import.service.js';
import { upsertSeo } from '../modules/seo/seo.service.js';
import { prisma } from '../lib/prisma.js';

/**
 * Admin API.
 *
 * Two layers of protection, both server-side:
 *   1. `requireAdminAccess` — the caller must hold at least one admin
 *      permission before any admin route is even considered;
 *   2. `requirePermissions(...)` on each route — the specific capability.
 *
 * The frontend hides screens the user cannot use, but that is presentation
 * only; every one of these routes is safe to call directly.
 */
export const adminRouter: Router = Router();

adminRouter.use(authenticate, requireAdminAccess);

/** Uploads are buffered in memory and validated before they reach storage. */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.maxUploadBytes, files: 1 },
});

/* ------------------------------------------------------------- dashboard */

adminRouter.get(
  '/overview',
  requirePermissions(PERMISSIONS.ANALYTICS_READ),
  asyncHandler(async (_req, res) => ok(res, await analyticsService.getAdminOverview())),
);

/* ----------------------------------------------------------------- users */

adminRouter.get(
  '/users',
  requirePermissions(PERMISSIONS.USERS_READ),
  validateQuery(userListQuerySchema),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as z.infer<typeof userListQuerySchema>;
    const result = await usersService.listUsers(query);
    ok(res, result.items, 200, result.meta);
  }),
);

adminRouter.get(
  '/users/:id',
  requirePermissions(PERMISSIONS.USERS_READ),
  asyncHandler(async (req, res) => ok(res, await usersService.getUserDetail(req.params.id!))),
);

adminRouter.post(
  '/users',
  requirePermissions(PERMISSIONS.USERS_CREATE),
  validateBody(adminCreateUserSchema),
  asyncHandler(async (req, res) => {
    const input = req.body as z.infer<typeof adminCreateUserSchema>;
    const user = await usersService.createUser(input);
    await recordAudit(req, {
      action: AUDIT_ACTIONS.USER_CREATED,
      targetType: 'user',
      targetId: user.id,
      metadata: { email: user.email },
    });
    ok(res, user, 201);
  }),
);

adminRouter.patch(
  '/users/:id',
  requirePermissions(PERMISSIONS.USERS_UPDATE),
  validateBody(adminUpdateUserSchema),
  asyncHandler(async (req, res) => {
    const input = req.body as z.infer<typeof adminUpdateUserSchema>;
    const user = await usersService.updateUser(req.params.id!, input, {
      id: req.user!.id,
      isSuperAdmin: req.user!.isSuperAdmin,
    });
    await recordAudit(req, {
      action: AUDIT_ACTIONS.USER_UPDATED,
      targetType: 'user',
      targetId: user.id,
      metadata: { fields: Object.keys(input) },
    });
    ok(res, user);
  }),
);

adminRouter.put(
  '/users/:id/roles',
  requirePermissions(PERMISSIONS.USERS_UPDATE, PERMISSIONS.ROLES_MANAGE),
  validateBody(assignRolesSchema),
  asyncHandler(async (req, res) => {
    const { roleIds } = req.body as z.infer<typeof assignRolesSchema>;
    const user = await usersService.assignRoles(req.params.id!, roleIds, {
      id: req.user!.id,
      isSuperAdmin: req.user!.isSuperAdmin,
    });
    await recordAudit(req, {
      action: AUDIT_ACTIONS.USER_ROLES_CHANGED,
      targetType: 'user',
      targetId: user.id,
      metadata: { roles: user.roles.map((role) => role.slug) },
    });
    ok(res, user);
  }),
);

adminRouter.post(
  '/users/:id/delete',
  requirePermissions(PERMISSIONS.USERS_DELETE),
  validateBody(deleteUserSchema),
  asyncHandler(async (req, res) => {
    const input = req.body as z.infer<typeof deleteUserSchema>;
    const result = await usersService.deleteUser(req.params.id!, input.strategy, {
      id: req.user!.id,
      isSuperAdmin: req.user!.isSuperAdmin,
    });
    await recordAudit(req, {
      action: AUDIT_ACTIONS.USER_DELETED,
      targetType: 'user',
      targetId: req.params.id!,
      metadata: { strategy: input.strategy, reason: input.reason },
    });
    ok(res, result);
  }),
);

/* ----------------------------------------------------------------- roles */

adminRouter.get(
  '/roles',
  requirePermissions(PERMISSIONS.ROLES_READ),
  asyncHandler(async (_req, res) => ok(res, await rolesService.listRoles())),
);

adminRouter.get(
  '/permissions',
  requirePermissions(PERMISSIONS.ROLES_READ),
  asyncHandler(async (_req, res) => ok(res, rolesService.listPermissionCatalogue())),
);

adminRouter.post(
  '/roles',
  requirePermissions(PERMISSIONS.ROLES_MANAGE),
  validateBody(createRoleSchema),
  asyncHandler(async (req, res) => {
    const role = await rolesService.createRole(req.body as never);
    await recordAudit(req, {
      action: AUDIT_ACTIONS.ROLE_CREATED,
      targetType: 'role',
      targetId: role.id,
      metadata: { slug: role.slug },
    });
    ok(res, role, 201);
  }),
);

adminRouter.patch(
  '/roles/:id',
  requirePermissions(PERMISSIONS.ROLES_MANAGE),
  validateBody(updateRoleSchema),
  asyncHandler(async (req, res) => {
    const role = await rolesService.updateRole(req.params.id!, req.body as never);
    await recordAudit(req, {
      action: AUDIT_ACTIONS.ROLE_UPDATED,
      targetType: 'role',
      targetId: role.id,
      metadata: { permissionCount: role.permissions.length },
    });
    ok(res, role);
  }),
);

adminRouter.delete(
  '/roles/:id',
  requirePermissions(PERMISSIONS.ROLES_MANAGE),
  asyncHandler(async (req, res) => {
    await rolesService.deleteRole(req.params.id!);
    await recordAudit(req, {
      action: AUDIT_ACTIONS.ROLE_DELETED,
      targetType: 'role',
      targetId: req.params.id!,
    });
    noContent(res);
  }),
);

/* ------------------------------------------------------------ categories */

adminRouter.get(
  '/categories',
  requirePermissions(PERMISSIONS.CATEGORIES_READ),
  validateQuery(categoryListQuerySchema),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as z.infer<typeof categoryListQuerySchema>;
    ok(
      res,
      await categoriesService.listCategories({
        locale: req.locale,
        tree: query.tree ?? false,
        search: query.search,
        isActive: query.isActive,
      }),
    );
  }),
);

adminRouter.post(
  '/categories',
  requirePermissions(PERMISSIONS.CATEGORIES_MANAGE),
  validateBody(createCategorySchema),
  asyncHandler(async (req, res) => {
    const category = await categoriesService.createCategory(req.body as never, req.locale);
    await recordAudit(req, {
      action: AUDIT_ACTIONS.CATEGORY_CREATED,
      targetType: 'category',
      targetId: category.id,
      metadata: { slug: category.slug },
    });
    ok(res, category, 201);
  }),
);

adminRouter.patch(
  '/categories/:id',
  requirePermissions(PERMISSIONS.CATEGORIES_MANAGE),
  validateBody(updateCategorySchema),
  asyncHandler(async (req, res) => {
    const category = await categoriesService.updateCategory(
      req.params.id!,
      req.body as never,
      req.locale,
    );
    await recordAudit(req, {
      action: AUDIT_ACTIONS.CATEGORY_UPDATED,
      targetType: 'category',
      targetId: category.id,
    });
    ok(res, category);
  }),
);

adminRouter.delete(
  '/categories/:id',
  requirePermissions(PERMISSIONS.CATEGORIES_MANAGE),
  asyncHandler(async (req, res) => {
    await categoriesService.deleteCategory(req.params.id!);
    await recordAudit(req, {
      action: AUDIT_ACTIONS.CATEGORY_DELETED,
      targetType: 'category',
      targetId: req.params.id!,
    });
    noContent(res);
  }),
);

adminRouter.put(
  '/categories/reorder',
  requirePermissions(PERMISSIONS.CATEGORIES_MANAGE),
  validateBody(sortOrderItemsSchema),
  asyncHandler(async (req, res) => {
    const { items } = req.body as z.infer<typeof sortOrderItemsSchema>;
    await categoriesService.reorderCategories(items);
    noContent(res);
  }),
);

/* --------------------------------------------------------------- courses */

adminRouter.get(
  '/courses',
  requirePermissions(PERMISSIONS.COURSES_READ),
  validateQuery(courseListQuerySchema),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as z.infer<typeof courseListQuerySchema>;
    const result = await coursesService.listCourses({
      ...query,
      locale: req.locale,
      includeUnpublished: true,
    });
    ok(res, result.items, 200, result.meta);
  }),
);

adminRouter.get(
  '/courses/:id',
  requirePermissions(PERMISSIONS.COURSES_READ),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await coursesService.getCourseById(req.params.id!, {
        locale: req.locale,
        includeUnpublished: true,
      }),
    );
  }),
);

adminRouter.get(
  '/courses/:id/analytics',
  requirePermissions(PERMISSIONS.ANALYTICS_READ),
  asyncHandler(async (req, res) => ok(res, await analyticsService.getCourseAnalytics(req.params.id!))),
);

adminRouter.post(
  '/courses',
  requirePermissions(PERMISSIONS.COURSES_CREATE),
  validateBody(createCourseSchema),
  asyncHandler(async (req, res) => {
    const course = await coursesService.createCourse(req.body as never, req.locale);
    await recordAudit(req, {
      action: AUDIT_ACTIONS.COURSE_CREATED,
      targetType: 'course',
      targetId: course.id,
      metadata: { slug: course.slug },
    });
    ok(res, course, 201);
  }),
);

adminRouter.patch(
  '/courses/:id',
  requirePermissions(PERMISSIONS.COURSES_UPDATE),
  validateBody(updateCourseSchema),
  asyncHandler(async (req, res) => {
    const course = await coursesService.updateCourse(req.params.id!, req.body as never, req.locale);
    await recordAudit(req, {
      action: AUDIT_ACTIONS.COURSE_UPDATED,
      targetType: 'course',
      targetId: course.id,
    });
    ok(res, course);
  }),
);

adminRouter.put(
  '/courses/:id/status',
  requirePermissions(PERMISSIONS.COURSES_PUBLISH),
  validateBody(publishCourseSchema),
  asyncHandler(async (req, res) => {
    const { status } = req.body as z.infer<typeof publishCourseSchema>;
    const course = await coursesService.setCourseStatus(req.params.id!, status, req.locale);
    await recordAudit(req, {
      action: AUDIT_ACTIONS.COURSE_STATUS_CHANGED,
      targetType: 'course',
      targetId: course.id,
      metadata: { status },
    });
    ok(res, course);
  }),
);

adminRouter.post(
  '/courses/:id/duplicate',
  requirePermissions(PERMISSIONS.COURSES_CREATE),
  asyncHandler(async (req, res) => {
    const course = await coursesService.duplicateCourse(req.params.id!, req.locale);
    await recordAudit(req, {
      action: AUDIT_ACTIONS.COURSE_DUPLICATED,
      targetType: 'course',
      targetId: course.id,
      metadata: { sourceId: req.params.id },
    });
    ok(res, course, 201);
  }),
);

adminRouter.delete(
  '/courses/:id',
  requirePermissions(PERMISSIONS.COURSES_DELETE),
  asyncHandler(async (req, res) => {
    await coursesService.deleteCourse(req.params.id!);
    await recordAudit(req, {
      action: AUDIT_ACTIONS.COURSE_DELETED,
      targetType: 'course',
      targetId: req.params.id!,
    });
    noContent(res);
  }),
);

adminRouter.post(
  '/courses/:id/restore',
  requirePermissions(PERMISSIONS.COURSES_UPDATE),
  asyncHandler(async (req, res) => {
    await coursesService.restoreCourse(req.params.id!);
    noContent(res);
  }),
);

/* --------------------------------------------------------------- modules */

adminRouter.post(
  '/courses/:courseId/modules',
  requirePermissions(PERMISSIONS.COURSES_UPDATE),
  validateBody(createModuleSchema),
  asyncHandler(async (req, res) => {
    ok(res, await lessonsService.createModule(req.params.courseId!, req.body as never), 201);
  }),
);

adminRouter.patch(
  '/modules/:id',
  requirePermissions(PERMISSIONS.COURSES_UPDATE),
  validateBody(updateModuleSchema),
  asyncHandler(async (req, res) => {
    await lessonsService.updateModule(req.params.id!, req.body as never);
    noContent(res);
  }),
);

adminRouter.delete(
  '/modules/:id',
  requirePermissions(PERMISSIONS.COURSES_UPDATE),
  asyncHandler(async (req, res) => {
    await lessonsService.deleteModule(req.params.id!);
    noContent(res);
  }),
);

adminRouter.put(
  '/courses/:courseId/modules/reorder',
  requirePermissions(PERMISSIONS.COURSES_UPDATE),
  validateBody(sortOrderItemsSchema),
  asyncHandler(async (req, res) => {
    const { items } = req.body as z.infer<typeof sortOrderItemsSchema>;
    await lessonsService.reorderModules(req.params.courseId!, items);
    noContent(res);
  }),
);

/* --------------------------------------------------------------- lessons */

adminRouter.get(
  '/lessons/:id',
  requirePermissions(PERMISSIONS.COURSES_READ),
  asyncHandler(async (req, res) => {
    ok(res, await lessonsService.getLessonForAdmin(req.params.id!, req.locale));
  }),
);

adminRouter.post(
  '/lessons',
  requirePermissions(PERMISSIONS.COURSES_UPDATE),
  validateBody(createLessonSchema),
  asyncHandler(async (req, res) => {
    const input = req.body as z.infer<typeof createLessonSchema>;
    const lesson = await lessonsService.createLesson(input.moduleId, input as never);
    await recordAudit(req, {
      action: AUDIT_ACTIONS.LESSON_CREATED,
      targetType: 'lesson',
      targetId: lesson.id,
      metadata: { courseId: lesson.courseId },
    });
    ok(res, lesson, 201);
  }),
);

adminRouter.patch(
  '/lessons/:id',
  requirePermissions(PERMISSIONS.COURSES_UPDATE),
  validateBody(updateLessonSchema),
  asyncHandler(async (req, res) => {
    const lesson = await lessonsService.updateLesson(req.params.id!, req.body as never);
    await recordAudit(req, {
      action: AUDIT_ACTIONS.LESSON_UPDATED,
      targetType: 'lesson',
      targetId: lesson.id,
    });
    ok(res, lesson);
  }),
);

adminRouter.delete(
  '/lessons/:id',
  requirePermissions(PERMISSIONS.COURSES_UPDATE),
  asyncHandler(async (req, res) => {
    await lessonsService.deleteLesson(req.params.id!);
    await recordAudit(req, {
      action: AUDIT_ACTIONS.LESSON_DELETED,
      targetType: 'lesson',
      targetId: req.params.id!,
    });
    noContent(res);
  }),
);

adminRouter.put(
  '/modules/:moduleId/lessons/reorder',
  requirePermissions(PERMISSIONS.COURSES_UPDATE),
  validateBody(sortOrderItemsSchema),
  asyncHandler(async (req, res) => {
    const { items } = req.body as z.infer<typeof sortOrderItemsSchema>;
    await lessonsService.reorderLessons(req.params.moduleId!, items);
    noContent(res);
  }),
);

/* ------------------------------------------------------------ PDF import */

adminRouter.post(
  '/content/pdf/preview',
  requirePermissions(PERMISSIONS.COURSES_UPDATE),
  validateBody(pdfImportSchema.pick({ mediaId: true })),
  asyncHandler(async (req, res) => {
    // Preview first: the admin sees the converted structure before any lesson
    // is created, because PDF extraction is a best-effort heuristic.
    const { mediaId } = req.body as { mediaId: string };
    ok(res, await pdfImportService.extractPdfContent(mediaId));
  }),
);

adminRouter.post(
  '/content/pdf/import',
  requirePermissions(PERMISSIONS.COURSES_UPDATE),
  validateBody(pdfImportSchema),
  asyncHandler(async (req, res) => {
    const input = req.body as z.infer<typeof pdfImportSchema>;
    if (!input.moduleId) throw new BadRequestError('Choose the module to import into');

    const extraction = await pdfImportService.extractPdfContent(input.mediaId);
    const createdLessons: { id: string; title: string }[] = [];

    if (input.splitByHeadings && extraction.outline.length > 0) {
      const sections = pdfImportService.splitDocumentByHeadings(
        extraction.document,
        extraction.outline,
      );
      for (const section of sections) {
        const lesson = await lessonsService.createLesson(input.moduleId, {
          title: section.title,
          body: section.document,
          type: 'ARTICLE',
          // Imported content is never published automatically — it is a draft
          // for the admin to review.
          isPublished: false,
          sourcePdfMediaId: input.keepOriginal ? input.mediaId : null,
        });
        createdLessons.push({ id: lesson.id, title: lesson.title });
      }
    } else {
      const lesson = await lessonsService.createLesson(input.moduleId, {
        title: input.titleOverride ?? extraction.title ?? 'Imported lesson',
        body: extraction.document,
        type: 'ARTICLE',
        isPublished: false,
        sourcePdfMediaId: input.keepOriginal ? input.mediaId : null,
      });
      createdLessons.push({ id: lesson.id, title: lesson.title });
    }

    await recordAudit(req, {
      action: AUDIT_ACTIONS.LESSON_PDF_IMPORTED,
      targetType: 'module',
      targetId: input.moduleId,
      metadata: { mediaId: input.mediaId, lessons: createdLessons.length },
    });

    ok(res, { lessons: createdLessons, warnings: extraction.warnings, pageCount: extraction.pageCount }, 201);
  }),
);

/* ----------------------------------------------------------- instructors */

adminRouter.get(
  '/instructors',
  requirePermissions(PERMISSIONS.COURSES_READ),
  asyncHandler(async (_req, res) => ok(res, await instructorsService.listInstructors(true))),
);

adminRouter.post(
  '/instructors',
  requirePermissions(PERMISSIONS.COURSES_UPDATE),
  validateBody(createInstructorSchema),
  asyncHandler(async (req, res) =>
    ok(res, await instructorsService.createInstructor(req.body as never), 201),
  ),
);

adminRouter.patch(
  '/instructors/:id',
  requirePermissions(PERMISSIONS.COURSES_UPDATE),
  validateBody(updateInstructorSchema),
  asyncHandler(async (req, res) =>
    ok(res, await instructorsService.updateInstructor(req.params.id!, req.body as never)),
  ),
);

adminRouter.delete(
  '/instructors/:id',
  requirePermissions(PERMISSIONS.COURSES_UPDATE),
  asyncHandler(async (req, res) => {
    await instructorsService.deleteInstructor(req.params.id!);
    noContent(res);
  }),
);

/* ----------------------------------------------------------- enrollments */

const adminEnrollmentQuery = listQuerySchema.extend({
  courseId: z.string().optional(),
  userId: z.string().optional(),
  status: z.string().optional(),
});

adminRouter.get(
  '/enrollments',
  requirePermissions(PERMISSIONS.ENROLLMENTS_READ),
  validateQuery(adminEnrollmentQuery),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as z.infer<typeof adminEnrollmentQuery>;
    const result = await enrollmentsService.adminListEnrollments(query);
    ok(res, result.items, 200, result.meta);
  }),
);

const adminEnrollSchema = z.object({
  userId: z.string().min(1),
  courseId: z.string().min(1),
});

adminRouter.post(
  '/enrollments',
  requirePermissions(PERMISSIONS.ENROLLMENTS_MANAGE),
  validateBody(adminEnrollSchema),
  asyncHandler(async (req, res) => {
    const input = req.body as z.infer<typeof adminEnrollSchema>;
    // `source: 'admin'` bypasses the self-service access rules by design — this
    // is how invite-only and paid courses are granted.
    const enrollment = await enrollmentsService.enroll({
      userId: input.userId,
      courseId: input.courseId,
      source: 'admin',
      emailVerified: true,
    });
    await recordAudit(req, {
      action: AUDIT_ACTIONS.ENROLLMENT_CREATED,
      targetType: 'enrollment',
      targetId: enrollment.id,
      metadata: input,
    });
    ok(res, enrollment, 201);
  }),
);

adminRouter.delete(
  '/enrollments/:userId/:courseId',
  requirePermissions(PERMISSIONS.ENROLLMENTS_MANAGE),
  asyncHandler(async (req, res) => {
    await enrollmentsService.cancelEnrollment(req.params.userId!, req.params.courseId!);
    await recordAudit(req, {
      action: AUDIT_ACTIONS.ENROLLMENT_CANCELLED,
      targetType: 'enrollment',
      targetId: `${req.params.userId}:${req.params.courseId}`,
    });
    noContent(res);
  }),
);

/* ----------------------------------------------------------------- pages */

adminRouter.get(
  '/pages',
  requirePermissions(PERMISSIONS.PAGES_READ),
  validateQuery(pageListQuerySchema),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as z.infer<typeof pageListQuerySchema>;
    const result = await pagesService.listPages({ ...query, locale: req.locale });
    ok(res, result.items, 200, result.meta);
  }),
);

adminRouter.get(
  '/pages/:id',
  requirePermissions(PERMISSIONS.PAGES_READ),
  asyncHandler(async (req, res) => ok(res, await pagesService.getPageById(req.params.id!, req.locale))),
);

adminRouter.post(
  '/pages',
  requirePermissions(PERMISSIONS.PAGES_CREATE),
  validateBody(createPageSchema),
  asyncHandler(async (req, res) => {
    const page = await pagesService.createPage(req.body as never, req.locale);
    await recordAudit(req, {
      action: AUDIT_ACTIONS.PAGE_CREATED,
      targetType: 'page',
      targetId: page.id,
      metadata: { slug: page.slug },
    });
    ok(res, page, 201);
  }),
);

adminRouter.patch(
  '/pages/:id',
  requirePermissions(PERMISSIONS.PAGES_UPDATE),
  validateBody(updatePageSchema),
  asyncHandler(async (req, res) => {
    const page = await pagesService.updatePage(req.params.id!, req.body as never, req.locale);
    await recordAudit(req, {
      action: AUDIT_ACTIONS.PAGE_UPDATED,
      targetType: 'page',
      targetId: page.id,
    });
    ok(res, page);
  }),
);

adminRouter.delete(
  '/pages/:id',
  requirePermissions(PERMISSIONS.PAGES_DELETE),
  asyncHandler(async (req, res) => {
    await pagesService.deletePage(req.params.id!);
    await recordAudit(req, {
      action: AUDIT_ACTIONS.PAGE_DELETED,
      targetType: 'page',
      targetId: req.params.id!,
    });
    noContent(res);
  }),
);

/* -------------------------------------------------------------- sections */

adminRouter.post(
  '/pages/:pageId/sections',
  requirePermissions(PERMISSIONS.PAGES_UPDATE),
  validateBody(createSectionSchema),
  asyncHandler(async (req, res) => {
    const page = await pagesService.addSection(req.params.pageId!, req.body as never, req.locale);
    await recordAudit(req, {
      action: AUDIT_ACTIONS.SECTION_CREATED,
      targetType: 'page',
      targetId: req.params.pageId!,
      metadata: { type: (req.body as { type: string }).type },
    });
    ok(res, page, 201);
  }),
);

adminRouter.patch(
  '/sections/:id',
  requirePermissions(PERMISSIONS.PAGES_UPDATE),
  validateBody(updateSectionSchema),
  asyncHandler(async (req, res) => {
    ok(res, await pagesService.updateSection(req.params.id!, req.body as never, req.locale));
  }),
);

adminRouter.delete(
  '/sections/:id',
  requirePermissions(PERMISSIONS.PAGES_UPDATE),
  asyncHandler(async (req, res) => {
    ok(res, await pagesService.deleteSection(req.params.id!, req.locale));
  }),
);

adminRouter.post(
  '/sections/:id/duplicate',
  requirePermissions(PERMISSIONS.PAGES_UPDATE),
  asyncHandler(async (req, res) => {
    ok(res, await pagesService.duplicateSection(req.params.id!, req.locale), 201);
  }),
);

adminRouter.put(
  '/pages/:pageId/sections/reorder',
  requirePermissions(PERMISSIONS.PAGES_UPDATE),
  validateBody(reorderSectionsSchema),
  asyncHandler(async (req, res) => {
    const { sectionIds } = req.body as z.infer<typeof reorderSectionsSchema>;
    const page = await pagesService.reorderSections(req.params.pageId!, sectionIds, req.locale);
    await recordAudit(req, {
      action: AUDIT_ACTIONS.SECTIONS_REORDERED,
      targetType: 'page',
      targetId: req.params.pageId!,
    });
    ok(res, page);
  }),
);

/* ----------------------------------------------------------------- menus */

adminRouter.get(
  '/menus',
  requirePermissions(PERMISSIONS.MENUS_MANAGE),
  asyncHandler(async (_req, res) => ok(res, await menusService.listMenus())),
);

adminRouter.post(
  '/menus',
  requirePermissions(PERMISSIONS.MENUS_MANAGE),
  validateBody(createMenuSchema),
  asyncHandler(async (req, res) => ok(res, await menusService.createMenu(req.body as never), 201)),
);

adminRouter.get(
  '/menus/:slug/items',
  requirePermissions(PERMISSIONS.MENUS_MANAGE),
  asyncHandler(async (req, res) => ok(res, await menusService.getMenuItemsForAdmin(req.params.slug!))),
);

adminRouter.post(
  '/menus/:slug/items',
  requirePermissions(PERMISSIONS.MENUS_MANAGE),
  validateBody(createMenuItemSchema),
  asyncHandler(async (req, res) => {
    ok(res, await menusService.addMenuItem(req.params.slug!, req.body as never), 201);
  }),
);

adminRouter.patch(
  '/menu-items/:id',
  requirePermissions(PERMISSIONS.MENUS_MANAGE),
  validateBody(updateMenuItemSchema),
  asyncHandler(async (req, res) => {
    ok(res, await menusService.updateMenuItem(req.params.id!, req.body as never));
  }),
);

adminRouter.delete(
  '/menu-items/:id',
  requirePermissions(PERMISSIONS.MENUS_MANAGE),
  asyncHandler(async (req, res) => ok(res, await menusService.deleteMenuItem(req.params.id!))),
);

adminRouter.put(
  '/menus/:slug/reorder',
  requirePermissions(PERMISSIONS.MENUS_MANAGE),
  validateBody(reorderMenuSchema),
  asyncHandler(async (req, res) => {
    const { items } = req.body as z.infer<typeof reorderMenuSchema>;
    const result = await menusService.reorderMenu(req.params.slug!, items);
    await recordAudit(req, {
      action: AUDIT_ACTIONS.MENU_UPDATED,
      targetType: 'menu',
      targetId: req.params.slug!,
    });
    ok(res, result);
  }),
);

/* ---------------------------------------------------------------- footer */

adminRouter.get(
  '/footer',
  requirePermissions(PERMISSIONS.MENUS_MANAGE),
  asyncHandler(async (_req, res) => ok(res, await menusService.listFooterGroupsForAdmin())),
);

adminRouter.post(
  '/footer/groups',
  requirePermissions(PERMISSIONS.MENUS_MANAGE),
  validateBody(footerGroupSchema),
  asyncHandler(async (req, res) => ok(res, await menusService.createFooterGroup(req.body as never), 201)),
);

adminRouter.patch(
  '/footer/groups/:id',
  requirePermissions(PERMISSIONS.MENUS_MANAGE),
  validateBody(footerGroupSchema.partial()),
  asyncHandler(async (req, res) =>
    ok(res, await menusService.updateFooterGroup(req.params.id!, req.body as never)),
  ),
);

adminRouter.delete(
  '/footer/groups/:id',
  requirePermissions(PERMISSIONS.MENUS_MANAGE),
  asyncHandler(async (req, res) => {
    await menusService.deleteFooterGroup(req.params.id!);
    noContent(res);
  }),
);

adminRouter.post(
  '/footer/groups/:groupId/links',
  requirePermissions(PERMISSIONS.MENUS_MANAGE),
  validateBody(footerLinkSchema),
  asyncHandler(async (req, res) =>
    ok(res, await menusService.createFooterLink(req.params.groupId!, req.body as never), 201),
  ),
);

adminRouter.patch(
  '/footer/links/:id',
  requirePermissions(PERMISSIONS.MENUS_MANAGE),
  validateBody(footerLinkSchema.partial()),
  asyncHandler(async (req, res) =>
    ok(res, await menusService.updateFooterLink(req.params.id!, req.body as never)),
  ),
);

adminRouter.delete(
  '/footer/links/:id',
  requirePermissions(PERMISSIONS.MENUS_MANAGE),
  asyncHandler(async (req, res) => {
    await menusService.deleteFooterLink(req.params.id!);
    noContent(res);
  }),
);

/* ----------------------------------------------------------------- media */

adminRouter.get(
  '/media',
  requirePermissions(PERMISSIONS.MEDIA_READ),
  validateQuery(mediaListQuerySchema),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as z.infer<typeof mediaListQuerySchema>;
    const result = await mediaService.listMedia(query);
    ok(res, result.items, 200, result.meta);
  }),
);

adminRouter.get(
  '/media/folders',
  requirePermissions(PERMISSIONS.MEDIA_READ),
  asyncHandler(async (_req, res) => ok(res, await mediaService.listFolders())),
);

adminRouter.get(
  '/media/unused',
  requirePermissions(PERMISSIONS.MEDIA_DELETE),
  asyncHandler(async (_req, res) => ok(res, await mediaService.findUnusedMedia())),
);

adminRouter.post(
  '/media',
  requirePermissions(PERMISSIONS.MEDIA_UPLOAD),
  uploadLimiter,
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new BadRequestError('No file was uploaded');

    const media = await mediaService.uploadMedia({
      buffer: req.file.buffer,
      originalName: req.file.originalname,
      // Treated as a hint only; the service verifies the magic bytes.
      declaredMimeType: req.file.mimetype,
      folder: typeof req.body.folder === 'string' ? req.body.folder : null,
      altText: typeof req.body.altText === 'string' ? req.body.altText : null,
      uploadedById: req.user!.id,
    });

    await recordAudit(req, {
      action: AUDIT_ACTIONS.MEDIA_UPLOADED,
      targetType: 'media',
      targetId: media.id,
      metadata: { mimeType: media.mimeType, sizeBytes: media.sizeBytes },
    });

    ok(res, media, 201);
  }),
);

adminRouter.patch(
  '/media/:id',
  requirePermissions(PERMISSIONS.MEDIA_UPLOAD),
  validateBody(updateMediaSchema),
  asyncHandler(async (req, res) => ok(res, await mediaService.updateMedia(req.params.id!, req.body as never))),
);

adminRouter.delete(
  '/media/:id',
  requirePermissions(PERMISSIONS.MEDIA_DELETE),
  asyncHandler(async (req, res) => {
    await mediaService.deleteMedia(req.params.id!);
    await recordAudit(req, {
      action: AUDIT_ACTIONS.MEDIA_DELETED,
      targetType: 'media',
      targetId: req.params.id!,
    });
    noContent(res);
  }),
);

/* ------------------------------------------------------------------ blog */

adminRouter.get(
  '/blog',
  requirePermissions(PERMISSIONS.BLOG_READ),
  validateQuery(blogListQuerySchema),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as z.infer<typeof blogListQuerySchema>;
    const result = await blogService.listPosts({
      ...query,
      locale: req.locale,
      includeUnpublished: true,
    });
    ok(res, result.items, 200, result.meta);
  }),
);

adminRouter.get(
  '/blog/:id',
  requirePermissions(PERMISSIONS.BLOG_READ),
  asyncHandler(async (req, res) => ok(res, await blogService.getPostById(req.params.id!, req.locale))),
);

adminRouter.post(
  '/blog',
  requirePermissions(PERMISSIONS.BLOG_MANAGE),
  validateBody(createBlogPostSchema),
  asyncHandler(async (req, res) => {
    ok(res, await blogService.createPost(req.body as never, req.user!.id, req.locale), 201);
  }),
);

adminRouter.patch(
  '/blog/:id',
  requirePermissions(PERMISSIONS.BLOG_MANAGE),
  validateBody(updateBlogPostSchema),
  asyncHandler(async (req, res) => {
    ok(res, await blogService.updatePost(req.params.id!, req.body as never, req.locale));
  }),
);

adminRouter.delete(
  '/blog/:id',
  requirePermissions(PERMISSIONS.BLOG_MANAGE),
  asyncHandler(async (req, res) => {
    await blogService.deletePost(req.params.id!);
    noContent(res);
  }),
);

/* ----------------------------------------------------------------- legal */

adminRouter.get(
  '/legal',
  requirePermissions(PERMISSIONS.LEGAL_MANAGE),
  asyncHandler(async (_req, res) => ok(res, await legalService.listLegalDocuments())),
);

adminRouter.post(
  '/legal',
  requirePermissions(PERMISSIONS.LEGAL_MANAGE),
  validateBody(legalDocumentSchema),
  asyncHandler(async (req, res) => ok(res, await legalService.createDocument(req.body as never), 201)),
);

adminRouter.patch(
  '/legal/:id',
  requirePermissions(PERMISSIONS.LEGAL_MANAGE),
  validateBody(legalDocumentSchema.partial().omit({ slug: true })),
  asyncHandler(async (req, res) =>
    ok(res, await legalService.updateDocument(req.params.id!, req.body as never)),
  ),
);

adminRouter.get(
  '/legal/:id/versions',
  requirePermissions(PERMISSIONS.LEGAL_MANAGE),
  asyncHandler(async (req, res) => ok(res, await legalService.listVersions(req.params.id!))),
);

adminRouter.post(
  '/legal/:id/versions',
  requirePermissions(PERMISSIONS.LEGAL_MANAGE),
  validateBody(legalVersionSchema),
  asyncHandler(async (req, res) => {
    const version = await legalService.publishVersion(req.params.id!, req.body as never);
    await recordAudit(req, {
      action: AUDIT_ACTIONS.LEGAL_PUBLISHED,
      targetType: 'legal_document',
      targetId: req.params.id!,
      metadata: { version: version.version },
    });
    ok(res, version, 201);
  }),
);

/* -------------------------------------------------------------- commerce */

adminRouter.get(
  '/products',
  requirePermissions(PERMISSIONS.PRODUCTS_READ),
  validateQuery(productListQuerySchema),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as z.infer<typeof productListQuerySchema>;
    const result = await commerceService.listProducts({ ...query, includeInactive: true });
    ok(res, result.items, 200, result.meta);
  }),
);

adminRouter.get(
  '/products/:id',
  requirePermissions(PERMISSIONS.PRODUCTS_READ),
  asyncHandler(async (req, res) => ok(res, await commerceService.getProductById(req.params.id!))),
);

adminRouter.post(
  '/products',
  requirePermissions(PERMISSIONS.PRODUCTS_MANAGE),
  validateBody(createProductSchema),
  asyncHandler(async (req, res) => {
    const product = await commerceService.createProduct(req.body as never);
    await recordAudit(req, {
      action: AUDIT_ACTIONS.PRODUCT_CREATED,
      targetType: 'product',
      targetId: product.id,
    });
    ok(res, product, 201);
  }),
);

adminRouter.patch(
  '/products/:id',
  requirePermissions(PERMISSIONS.PRODUCTS_MANAGE),
  validateBody(updateProductSchema),
  asyncHandler(async (req, res) => {
    const product = await commerceService.updateProduct(req.params.id!, req.body as never);
    await recordAudit(req, {
      action: AUDIT_ACTIONS.PRODUCT_UPDATED,
      targetType: 'product',
      targetId: product.id,
    });
    ok(res, product);
  }),
);

adminRouter.delete(
  '/products/:id',
  requirePermissions(PERMISSIONS.PRODUCTS_MANAGE),
  asyncHandler(async (req, res) => {
    await commerceService.deleteProduct(req.params.id!);
    await recordAudit(req, {
      action: AUDIT_ACTIONS.PRODUCT_DELETED,
      targetType: 'product',
      targetId: req.params.id!,
    });
    noContent(res);
  }),
);

adminRouter.get(
  '/orders',
  requirePermissions(PERMISSIONS.ORDERS_READ),
  validateQuery(orderListQuerySchema),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as z.infer<typeof orderListQuerySchema>;
    const result = await commerceService.adminListOrders(query);
    ok(res, result.items, 200, result.meta);
  }),
);

adminRouter.get(
  '/orders/:id',
  requirePermissions(PERMISSIONS.ORDERS_READ),
  asyncHandler(async (req, res) => ok(res, await commerceService.getOrderById(req.params.id!))),
);

adminRouter.put(
  '/orders/:id/status',
  requirePermissions(PERMISSIONS.ORDERS_MANAGE),
  validateBody(updateOrderStatusSchema),
  asyncHandler(async (req, res) => {
    const input = req.body as z.infer<typeof updateOrderStatusSchema>;
    const order = await commerceService.updateOrderStatus(req.params.id!, input.status);
    await recordAudit(req, {
      action: AUDIT_ACTIONS.ORDER_STATUS_CHANGED,
      targetType: 'order',
      targetId: order.id,
      metadata: { status: input.status, note: input.note },
    });
    ok(res, order);
  }),
);

/* --------------------------------------------------------------- i18n */

adminRouter.get(
  '/languages',
  requirePermissions(PERMISSIONS.LANGUAGES_MANAGE),
  asyncHandler(async (_req, res) => ok(res, await languagesService.listAllLanguages())),
);

adminRouter.patch(
  '/languages/:code',
  requirePermissions(PERMISSIONS.LANGUAGES_MANAGE),
  validateBody(languageSchema.partial().omit({ code: true })),
  asyncHandler(async (req, res) => {
    const language = await languagesService.updateLanguage(req.params.code!, req.body as never);
    await recordAudit(req, {
      action: AUDIT_ACTIONS.LANGUAGE_UPDATED,
      targetType: 'language',
      targetId: language.code,
      metadata: { isActive: language.isActive, isDefault: language.isDefault },
    });
    ok(res, language);
  }),
);

adminRouter.get(
  '/translations/namespaces',
  requirePermissions(PERMISSIONS.TRANSLATIONS_MANAGE),
  asyncHandler(async (_req, res) => ok(res, await languagesService.listNamespaces())),
);

adminRouter.get(
  '/translations/:locale',
  requirePermissions(PERMISSIONS.TRANSLATIONS_MANAGE),
  asyncHandler(async (req, res) => {
    const namespace = typeof req.query.namespace === 'string' ? req.query.namespace : undefined;
    ok(res, await languagesService.listTranslationsForAdmin(req.params.locale!, namespace));
  }),
);

adminRouter.put(
  '/translations',
  requirePermissions(PERMISSIONS.TRANSLATIONS_MANAGE),
  validateBody(upsertTranslationsSchema),
  asyncHandler(async (req, res) => {
    const input = req.body as z.infer<typeof upsertTranslationsSchema>;
    const result = await languagesService.upsertTranslations(
      input.locale,
      input.namespace,
      input.entries,
    );
    await recordAudit(req, {
      action: AUDIT_ACTIONS.TRANSLATIONS_UPDATED,
      targetType: 'translations',
      targetId: `${input.locale}:${input.namespace}`,
      metadata: { updated: result.updated },
    });
    ok(res, result);
  }),
);

/* ------------------------------------------------------------------- SEO */

const routeSeoSchema = z.object({
  routeKey: z.string().trim().min(1).max(80),
  seo: z.record(z.unknown()),
});

adminRouter.put(
  '/seo/route',
  requirePermissions(PERMISSIONS.SEO_MANAGE),
  validateBody(routeSeoSchema),
  asyncHandler(async (req, res) => {
    const input = req.body as z.infer<typeof routeSeoSchema>;
    ok(res, await upsertSeo({ routeKey: input.routeKey }, input.seo as never));
  }),
);

/* -------------------------------------------------------------- settings */

adminRouter.get(
  '/settings',
  requirePermissions(PERMISSIONS.SETTINGS_MANAGE),
  asyncHandler(async (_req, res) => ok(res, await settingsService.getSettingsForAdmin())),
);

adminRouter.put(
  '/settings',
  requirePermissions(PERMISSIONS.SETTINGS_MANAGE),
  validateBody(siteSettingsSchema),
  asyncHandler(async (req, res) => {
    const mapped = settingsService.mapSettingsInput(req.body as Record<string, unknown>);
    const settings = await settingsService.updateSettings(mapped);
    await recordAudit(req, {
      action: AUDIT_ACTIONS.SETTINGS_UPDATED,
      targetType: 'settings',
      metadata: { keys: Object.keys(mapped) },
    });
    ok(res, settings);
  }),
);

/* --------------------------------------------------------- feature flags */

adminRouter.get(
  '/features',
  requirePermissions(PERMISSIONS.FEATURES_MANAGE),
  asyncHandler(async (_req, res) => ok(res, await featureFlagsService.listFeatureFlags())),
);

adminRouter.put(
  '/features/:key',
  requirePermissions(PERMISSIONS.FEATURES_MANAGE),
  validateBody(updateFeatureFlagSchema),
  asyncHandler(async (req, res) => {
    const { isEnabled } = req.body as z.infer<typeof updateFeatureFlagSchema>;
    const flag = await featureFlagsService.setFeatureFlag(req.params.key!, isEnabled);
    await recordAudit(req, {
      action: AUDIT_ACTIONS.FEATURE_TOGGLED,
      targetType: 'feature',
      targetId: flag.key,
      metadata: { isEnabled },
    });
    ok(res, flag);
  }),
);

/* ------------------------------------------------------------ audit logs */

adminRouter.get(
  '/audit-logs',
  requirePermissions(PERMISSIONS.AUDIT_READ),
  validateQuery(auditListQuerySchema),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as z.infer<typeof auditListQuerySchema>;
    const result = await listAuditLogs(query);
    ok(res, result.items, 200, result.meta);
  }),
);

/* ------------------------------------------------------- support inboxes */

adminRouter.get(
  '/contact-messages',
  requirePermissions(PERMISSIONS.SETTINGS_MANAGE),
  validateQuery(paginationSchema),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as z.infer<typeof paginationSchema>;
    const [items, total] = await Promise.all([
      prisma.contactMessage.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.contactMessage.count(),
    ]);
    ok(res, items, 200, {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      hasNextPage: query.page * query.pageSize < total,
      hasPreviousPage: query.page > 1,
    });
  }),
);

adminRouter.get(
  '/newsletter-subscribers',
  requirePermissions(PERMISSIONS.SETTINGS_MANAGE),
  validateQuery(paginationSchema),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as z.infer<typeof paginationSchema>;
    const [items, total] = await Promise.all([
      prisma.newsletterSubscriber.findMany({
        where: { unsubscribedAt: null },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.newsletterSubscriber.count({ where: { unsubscribedAt: null } }),
    ]);
    ok(res, items, 200, {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      hasNextPage: query.page * query.pageSize < total,
      hasPreviousPage: query.page > 1,
    });
  }),
);
