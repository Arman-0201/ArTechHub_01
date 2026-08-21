import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { hasDatabase } from '../setup.js';

/**
 * The learning domain: public catalogue, enrollment gating, lesson access and
 * server-side progress.
 *
 * These are the checks that matter most — every one of them is a place where a
 * client could otherwise grant itself access by editing a request.
 */
const describeWithDb = hasDatabase ? describe : describe.skip;

describeWithDb('catalogue and learning', () => {
  let app: Express;
  let prisma: typeof import('../../src/lib/prisma.js').prisma;

  const email = `learner-${Date.now()}@example.test`;
  const password = 'Str0ngPassword';
  let accessToken = '';
  let courseId = '';
  let courseSlug = '';
  let lessonId = '';

  beforeAll(async () => {
    const [{ createApp }, prismaModule] = await Promise.all([
      import('../../src/app.js'),
      import('../../src/lib/prisma.js'),
    ]);
    app = createApp();
    prisma = prismaModule.prisma;

    const register = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Test Learner',
        email,
        password,
        confirmPassword: password,
        acceptedTerms: true,
        acceptedPrivacy: true,
        marketingOptIn: false,
      });
    accessToken = register.body.data.accessToken;

    // Enrollment requires a verified address; the seed data does not create
    // one, so verify directly.
    await prisma.user.update({
      where: { email },
      data: { emailVerified: true, status: 'ACTIVE' },
    });

    const courses = await request(app).get('/api/v1/courses?pageSize=1');
    courseId = courses.body.data[0]?.id ?? '';
    courseSlug = courses.body.data[0]?.slug ?? '';
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
  });

  describe('public catalogue', () => {
    it('lists published courses with pagination metadata', async () => {
      const response = await request(app).get('/api/v1/courses?page=1&pageSize=5');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.meta.pageSize).toBe(5);
      expect(response.body.meta.total).toBeGreaterThan(0);
    });

    it('never returns drafts to an anonymous caller, even when asked', async () => {
      // `status` is only honoured on the admin router; the public list forces
      // published-only regardless of the query string.
      const response = await request(app).get('/api/v1/courses?status=DRAFT&pageSize=50');

      expect(response.status).toBe(200);
      for (const course of response.body.data) {
        expect(course.status).toBe('PUBLISHED');
      }
    });

    it('caps the page size', async () => {
      const response = await request(app).get('/api/v1/courses?pageSize=10000');
      expect(response.status).toBe(422);
    });

    it('returns a course by slug with its curriculum', async () => {
      const response = await request(app).get(`/api/v1/courses/${courseSlug}`);

      expect(response.status).toBe(200);
      expect(response.body.data.slug).toBe(courseSlug);
      expect(Array.isArray(response.body.data.modules)).toBe(true);
      expect(response.body.data.modules.length).toBeGreaterThan(0);

      lessonId = response.body.data.modules[0].lessons[0].id;
    });

    it('404s an unknown slug', async () => {
      await request(app).get('/api/v1/courses/no-such-course-anywhere').expect(404);
    });
  });

  describe('lesson access control', () => {
    it('serves a preview lesson to an anonymous visitor', async () => {
      const course = await request(app).get(`/api/v1/courses/${courseSlug}`);
      const preview = course.body.data.modules
        .flatMap((module: { lessons: { slug: string; isPreview: boolean }[] }) => module.lessons)
        .find((lesson: { isPreview: boolean }) => lesson.isPreview);

      if (!preview) return;

      const response = await request(app).get(
        `/api/v1/courses/${courseSlug}/lessons/${preview.slug}`,
      );
      expect(response.status).toBe(200);
      expect(response.body.data.body).toBeTruthy();
    });

    it('refuses a non-preview lesson to someone who is not enrolled', async () => {
      const course = await request(app).get(`/api/v1/courses/${courseSlug}`);
      const gated = course.body.data.modules
        .flatMap((module: { lessons: { slug: string; isPreview: boolean }[] }) => module.lessons)
        .find((lesson: { isPreview: boolean }) => !lesson.isPreview);

      if (!gated) return;

      // Anonymous.
      await request(app).get(`/api/v1/courses/${courseSlug}/lessons/${gated.slug}`).expect(403);

      // Signed in but not enrolled — authentication is not authorization.
      await request(app)
        .get(`/api/v1/courses/${courseSlug}/lessons/${gated.slug}`)
        .set('authorization', `Bearer ${accessToken}`)
        .expect(403);
    });
  });

  describe('enrollment and progress', () => {
    it('enrolls the learner', async () => {
      const response = await request(app)
        .post('/api/v1/account/enrollments')
        .set('authorization', `Bearer ${accessToken}`)
        .send({ courseId });

      expect(response.status).toBe(201);
      expect(response.body.data.status).toBe('ACTIVE');
    });

    it('refuses a duplicate enrollment', async () => {
      const response = await request(app)
        .post('/api/v1/account/enrollments')
        .set('authorization', `Bearer ${accessToken}`)
        .send({ courseId });

      expect(response.status).toBe(409);
    });

    it('unlocks gated lessons once enrolled', async () => {
      const response = await request(app)
        .get(`/api/v1/account/lessons/${lessonId}`)
        .set('authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.id).toBe(lessonId);
    });

    it('records completion server-side and recomputes course progress', async () => {
      const response = await request(app)
        .put(`/api/v1/account/lessons/${lessonId}/progress`)
        .set('authorization', `Bearer ${accessToken}`)
        .send({ isCompleted: true });

      expect(response.status).toBe(200);
      expect(response.body.data.lesson.isCompleted).toBe(true);
      expect(response.body.data.course.completedLessons).toBeGreaterThan(0);
      expect(response.body.data.course.progressPercent).toBeGreaterThan(0);
    });

    it('reflects the progress in the dashboard aggregate', async () => {
      const response = await request(app)
        .get('/api/v1/account/dashboard')
        .set('authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.stats.lessonsCompleted).toBeGreaterThan(0);
      expect(response.body.data.stats.totalCourses).toBeGreaterThan(0);
    });

    it('reverses cleanly when a lesson is un-completed', async () => {
      const response = await request(app)
        .put(`/api/v1/account/lessons/${lessonId}/progress`)
        .set('authorization', `Bearer ${accessToken}`)
        .send({ isCompleted: false });

      expect(response.status).toBe(200);
      expect(response.body.data.lesson.isCompleted).toBe(false);
      expect(response.body.data.lesson.completedAt).toBeNull();
    });

    it('refuses progress writes for a course the learner is not enrolled in', async () => {
      // Find a lesson in some other course.
      const other = await prisma.lesson.findFirst({
        where: { module: { courseId: { not: courseId } } },
        select: { id: true },
      });
      if (!other) return;

      const response = await request(app)
        .put(`/api/v1/account/lessons/${other.id}/progress`)
        .set('authorization', `Bearer ${accessToken}`)
        .send({ isCompleted: true });

      expect(response.status).toBe(403);
    });
  });

  describe('site bootstrap', () => {
    it('returns settings, languages, features and navigation in one call', async () => {
      const response = await request(app).get('/api/v1/site/bootstrap');

      expect(response.status).toBe(200);
      expect(response.body.data.settings.siteName).toBeTruthy();
      expect(response.body.data.languages.length).toBeGreaterThan(0);
      expect(response.body.data.features).toBeTypeOf('object');
      expect(response.body.data.menus.header).toBeTruthy();
    });

    it('omits role-restricted menu items for anonymous visitors', async () => {
      const response = await request(app).get('/api/v1/site/bootstrap');
      const labels = response.body.data.menus.header.items.map(
        (item: { label: string }) => item.label,
      );

      // The seeded admin link is restricted to staff roles, so it must not be
      // in the payload at all — not merely hidden by the client.
      expect(labels).not.toContain('Admin panel');
    });
  });
});
