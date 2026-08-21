import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import {
  acceptLegalSchema,
  cuidSchema,
  enrollSchema,
  lessonProgressSchema,
  paginationSchema,
  updatePreferencesSchema,
  updateProfileSchema,
} from '@academy/validation';
import { PERMISSIONS } from '@academy/types';
import { asyncHandler, getClientIp, noContent, ok } from '../lib/http.js';
import { BadRequestError, PayloadTooLargeError } from '../lib/errors.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { authenticate, requireVerifiedEmail } from '../middleware/authenticate.js';
import { uploadLimiter } from '../middleware/rate-limit.js';
import * as mediaService from '../modules/media/media.service.js';
import * as usersService from '../modules/users/users.service.js';
import * as enrollmentsService from '../modules/enrollments/enrollments.service.js';
import * as progressService from '../modules/progress/progress.service.js';
import * as lessonsService from '../modules/lessons/lessons.service.js';
import * as legalService from '../modules/legal/legal.service.js';
import * as commerceService from '../modules/ecommerce/ecommerce.service.js';
import { prisma } from '../lib/prisma.js';

/**
 * Signed-in learner API.
 *
 * Every handler derives the subject from `req.user.id` — the authenticated
 * session — and never from a client-supplied user id. That single rule is what
 * makes it impossible to read or mutate another learner's data by editing a
 * request.
 */
export const accountRouter: Router = Router();

accountRouter.use(authenticate);

/* --------------------------------------------------------------- profile */

accountRouter.get(
  '/profile',
  asyncHandler(async (req, res) => ok(res, await usersService.getUserDetail(req.user!.id))),
);

accountRouter.patch(
  '/profile',
  validateBody(updateProfileSchema),
  asyncHandler(async (req, res) => {
    const input = req.body as z.infer<typeof updateProfileSchema>;
    ok(res, await usersService.updateOwnProfile(req.user!.id, input));
  }),
);

/**
 * Avatar upload.
 *
 * Learners hold no media permissions, so they cannot use the admin upload
 * endpoint. This is a deliberately narrower door: one file, images only, a much
 * smaller size cap, and everything lands in a fixed `avatars` folder. The
 * uploaded id is not trusted afterwards — `updateOwnProfile` re-checks that the
 * media exists and is an image before attaching it.
 */
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: AVATAR_MAX_BYTES, files: 1 },
});

accountRouter.post(
  '/avatar',
  uploadLimiter,
  avatarUpload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new BadRequestError('No image was uploaded');
    if (!req.file.mimetype.startsWith('image/')) {
      throw new BadRequestError('Choose an image file');
    }
    if (req.file.size > AVATAR_MAX_BYTES) {
      throw new PayloadTooLargeError('Avatars must be 2MB or smaller');
    }

    const media = await mediaService.uploadMedia({
      buffer: req.file.buffer,
      originalName: req.file.originalname,
      declaredMimeType: req.file.mimetype,
      folder: 'avatars',
      altText: null,
      uploadedById: req.user!.id,
      allowedKinds: ['IMAGE'],
    });

    ok(res, media, 201);
  }),
);

accountRouter.patch(
  '/preferences',
  validateBody(updatePreferencesSchema),
  asyncHandler(async (req, res) => {
    const input = req.body as z.infer<typeof updatePreferencesSchema>;
    ok(res, await usersService.updatePreferences(req.user!.id, input));
  }),
);

/* -------------------------------------------------------------- dashboard */

accountRouter.get(
  '/dashboard',
  asyncHandler(async (req, res) => {
    const [stats, continueLearning, recent] = await Promise.all([
      progressService.computeLearningStats(req.user!.id),
      enrollmentsService.getContinueLearning(req.user!.id, req.locale, 3),
      enrollmentsService.listMyEnrollments({
        userId: req.user!.id,
        locale: req.locale,
        page: 1,
        pageSize: 6,
      }),
    ]);

    ok(res, { stats, continueLearning, recentCourses: recent.items });
  }),
);

accountRouter.get(
  '/stats',
  asyncHandler(async (req, res) => ok(res, await progressService.computeLearningStats(req.user!.id))),
);

/* ------------------------------------------------------------ enrollments */

const enrollmentQuerySchema = paginationSchema.extend({
  filter: z.enum(['all', 'in-progress', 'completed', 'not-started']).default('all'),
});

accountRouter.get(
  '/enrollments',
  validateQuery(enrollmentQuerySchema),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as z.infer<typeof enrollmentQuerySchema>;
    const result = await enrollmentsService.listMyEnrollments({
      userId: req.user!.id,
      locale: req.locale,
      page: query.page,
      pageSize: query.pageSize,
      filter: query.filter,
    });
    ok(res, result.items, 200, result.meta);
  }),
);

accountRouter.post(
  '/enrollments',
  // Enrolling is a real commitment on a real account, so it needs a verified
  // address; browsing does not.
  requireVerifiedEmail,
  validateBody(enrollSchema),
  asyncHandler(async (req, res) => {
    const { courseId } = req.body as z.infer<typeof enrollSchema>;
    const enrollment = await enrollmentsService.enroll({
      userId: req.user!.id,
      courseId,
      source: 'self',
      emailVerified: req.user!.emailVerified,
    });
    ok(res, enrollment, 201);
  }),
);

accountRouter.delete(
  '/enrollments/:courseId',
  asyncHandler(async (req, res) => {
    await enrollmentsService.cancelEnrollment(req.user!.id, req.params.courseId!);
    noContent(res);
  }),
);

accountRouter.get(
  '/enrollments/:courseId',
  asyncHandler(async (req, res) => {
    ok(res, await enrollmentsService.getEnrollment(req.user!.id, req.params.courseId!, req.locale));
  }),
);

/* --------------------------------------------------------------- learning */

accountRouter.get(
  '/courses/:courseId/progress',
  asyncHandler(async (req, res) => {
    const [progress, completedLessonIds] = await Promise.all([
      progressService.getCourseProgress(req.user!.id, req.params.courseId!),
      progressService.getCompletedLessonIds(req.user!.id, req.params.courseId!),
    ]);
    ok(res, { ...progress, completedLessonIds });
  }),
);

accountRouter.get(
  '/lessons/:lessonId',
  asyncHandler(async (req, res) => {
    const lesson = await lessonsService.getLessonById(req.params.lessonId!, {
      locale: req.locale,
      viewer: {
        id: req.user!.id,
        canManageCourses:
          req.user!.isSuperAdmin || req.user!.permissions.has(PERMISSIONS.COURSES_UPDATE),
      },
    });

    // Opening a lesson is what "continue where you left off" is based on.
    void progressService.markLessonVisited(req.user!.id, lesson.id).catch(() => undefined);

    ok(res, lesson);
  }),
);

accountRouter.put(
  '/lessons/:lessonId/progress',
  validateBody(lessonProgressSchema),
  asyncHandler(async (req, res) => {
    const input = req.body as z.infer<typeof lessonProgressSchema>;
    ok(
      res,
      await progressService.updateLessonProgress({
        userId: req.user!.id,
        lessonId: req.params.lessonId!,
        isCompleted: input.isCompleted,
        lastPositionSeconds: input.lastPositionSeconds,
      }),
    );
  }),
);

/* ------------------------------------------------------------------ legal */

accountRouter.get(
  '/legal/pending',
  asyncHandler(async (req, res) => ok(res, await legalService.getPendingAcceptances(req.user!.id))),
);

accountRouter.post(
  '/legal/accept',
  validateBody(acceptLegalSchema),
  asyncHandler(async (req, res) => {
    const input = req.body as z.infer<typeof acceptLegalSchema>;
    await legalService.recordAcceptances(
      req.user!.id,
      input.acceptances.map((entry) => entry.versionId),
      getClientIp(req),
    );
    noContent(res);
  }),
);

/* ----------------------------------------------------------------- orders */

accountRouter.get(
  '/orders',
  validateQuery(paginationSchema),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as z.infer<typeof paginationSchema>;
    const result = await commerceService.listOrdersForUser(
      req.user!.id,
      query.page,
      query.pageSize,
    );
    ok(res, result.items, 200, result.meta);
  }),
);

accountRouter.get(
  '/orders/:id',
  asyncHandler(async (req, res) => {
    // Ownership is part of the query, not a check afterwards.
    ok(res, await commerceService.getOrderForUser(req.params.id!, req.user!.id));
  }),
);

/* --------------------------------------------------------------- sessions */

const revokeSessionSchema = z.object({ sessionId: cuidSchema });

accountRouter.get(
  '/sessions',
  asyncHandler(async (req, res) => {
    const sessions = await prisma.refreshToken.findMany({
      where: { userId: req.user!.id, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      // The token hash is deliberately not selected: nothing outside the auth
      // service needs it, and it must never reach a response.
      select: { id: true, userAgent: true, ipAddress: true, createdAt: true, expiresAt: true },
    });
    ok(res, sessions);
  }),
);

accountRouter.post(
  '/sessions/revoke',
  validateBody(revokeSessionSchema),
  asyncHandler(async (req, res) => {
    const { sessionId } = req.body as z.infer<typeof revokeSessionSchema>;
    // Scoped to the caller's own sessions so one user cannot log another out.
    await prisma.refreshToken.updateMany({
      where: { id: sessionId, userId: req.user!.id },
      data: { revokedAt: new Date() },
    });
    noContent(res);
  }),
);
