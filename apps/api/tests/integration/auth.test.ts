import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { hasDatabase } from '../setup.js';

/**
 * Authentication and authorization flows, end to end through the real HTTP
 * stack against a real database.
 *
 * Skipped unless `TEST_DATABASE_URL` points at a disposable database, because
 * these tests write. Run them with:
 *
 *   TEST_DATABASE_URL=postgresql://…/academy_test npm test --workspace @academy/api
 *
 * The database must have the schema applied (`npm run db:push`) and be seeded
 * (`npm run db:seed`) so the Student role and legal documents exist.
 */
const describeWithDb = hasDatabase ? describe : describe.skip;

describeWithDb('auth flows', () => {
  let app: Express;
  let prisma: typeof import('../../src/lib/prisma.js').prisma;

  // A unique address per run keeps repeated runs from colliding.
  const email = `test-${Date.now()}@example.test`;
  const password = 'Str0ngPassword';
  let accessToken = '';
  let refreshCookie = '';

  beforeAll(async () => {
    const [{ createApp }, prismaModule] = await Promise.all([
      import('../../src/app.js'),
      import('../../src/lib/prisma.js'),
    ]);
    app = createApp();
    prisma = prismaModule.prisma;
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
  });

  describe('registration', () => {
    it('creates an account and returns a session', async () => {
      const response = await request(app)
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

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user.email).toBe(email);
      expect(response.body.data.accessToken).toBeTruthy();

      // The refresh token must arrive as an HttpOnly cookie and must NOT be in
      // the JSON body, where a script could read it.
      const cookies = response.headers['set-cookie'] as unknown as string[];
      const refresh = cookies.find((cookie) => cookie.startsWith('academy_rt='));
      expect(refresh).toBeDefined();
      expect(refresh).toContain('HttpOnly');
      expect(JSON.stringify(response.body)).not.toContain('academy_rt');
      expect(response.body.data.refreshToken).toBeUndefined();

      refreshCookie = refresh!.split(';')[0]!;
      accessToken = response.body.data.accessToken;
    });

    it('refuses a duplicate email', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          name: 'Impostor',
          email,
          password,
          confirmPassword: password,
          acceptedTerms: true,
          acceptedPrivacy: true,
          marketingOptIn: false,
        });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('CONFLICT');
    });

    it('rejects a weak password with field-level errors', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          name: 'Weak',
          email: `weak-${Date.now()}@example.test`,
          password: 'weak',
          confirmPassword: 'weak',
          acceptedTerms: true,
          acceptedPrivacy: true,
          marketingOptIn: false,
        });

      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.fields.password).toBeDefined();
    });
  });

  describe('login', () => {
    it('accepts the correct password', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({ email, password });

      expect(response.status).toBe(200);
      expect(response.body.data.user.email).toBe(email);
      accessToken = response.body.data.accessToken;
    });

    it('rejects the wrong password without revealing which field was wrong', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({ email, password: 'WrongPassword1' });

      expect(response.status).toBe(401);
      expect(response.body.error.message).toBe('Invalid email or password');
    });

    it('answers identically for an unknown account', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'nobody@example.test', password: 'WrongPassword1' });

      expect(response.status).toBe(401);
      // Identical message: the endpoint must not be an enumeration oracle.
      expect(response.body.error.message).toBe('Invalid email or password');
    });
  });

  describe('session', () => {
    it('returns the current user for a valid token', async () => {
      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.email).toBe(email);
      // A learner holds no admin permissions.
      expect(response.body.data.canAccessAdmin).toBe(false);
      expect(response.body.data.permissions).toEqual([]);
    });

    it('rejects a missing or malformed token', async () => {
      await request(app).get('/api/v1/auth/me').expect(401);
      await request(app)
        .get('/api/v1/auth/me')
        .set('authorization', 'Bearer garbage')
        .expect(401);
    });

    it('rotates the refresh token and invalidates the old one', async () => {
      const first = await request(app)
        .post('/api/v1/auth/refresh')
        .set('cookie', refreshCookie);

      expect(first.status).toBe(200);
      const rotated = (first.headers['set-cookie'] as unknown as string[])
        .find((cookie) => cookie.startsWith('academy_rt='))!
        .split(';')[0]!;
      expect(rotated).not.toBe(refreshCookie);

      // Re-presenting the consumed token is treated as theft: the whole family
      // is revoked, so even the freshly rotated token stops working.
      const reuse = await request(app)
        .post('/api/v1/auth/refresh')
        .set('cookie', refreshCookie);
      expect(reuse.status).toBe(401);

      const afterReuse = await request(app)
        .post('/api/v1/auth/refresh')
        .set('cookie', rotated);
      expect(afterReuse.status).toBe(401);
    });
  });

  /**
   * Server-side rendering has no bearer token — the Next server only ever holds
   * cookies. These assertions pin down the contract that makes authenticated
   * pages renderable at all; breaking any of them silently bounces every
   * signed-in user to the login screen.
   */
  describe('server-side session', () => {
    it('sets a refresh cookie the web server can actually receive', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({ email, password });

      const cookie = (response.headers['set-cookie'] as unknown as string[]).find((entry) =>
        entry.startsWith('academy_rt='),
      )!;

      // Path must be `/`. Scoped any narrower, the browser never sends it to
      // the Next server and server rendering cannot identify the user.
      expect(cookie).toMatch(/Path=\/(;|$)/);
      expect(cookie).toContain('HttpOnly');
    });

    it('identifies the user from the cookie alone', async () => {
      const login = await request(app).post('/api/v1/auth/login').send({ email, password });
      const cookie = (login.headers['set-cookie'] as unknown as string[])
        .find((entry) => entry.startsWith('academy_rt='))!
        .split(';')[0]!;

      const response = await request(app).get('/api/v1/auth/session').set('cookie', cookie);

      expect(response.status).toBe(200);
      expect(response.body.data.email).toBe(email);
      expect(response.body.data.canAccessAdmin).toBe(false);
    });

    it('does not rotate the token, so it is safe on every render', async () => {
      const login = await request(app).post('/api/v1/auth/login').send({ email, password });
      const cookie = (login.headers['set-cookie'] as unknown as string[])
        .find((entry) => entry.startsWith('academy_rt='))!
        .split(';')[0]!;

      const first = await request(app).get('/api/v1/auth/session').set('cookie', cookie);
      const second = await request(app).get('/api/v1/auth/session').set('cookie', cookie);

      // Same cookie still works, and nothing new was issued. Rotating here would
      // leave the browser holding a stale token, and the next genuine refresh
      // would read as reuse and sign the user out everywhere.
      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(second.body.data.email).toBe(email);
      expect(first.headers['set-cookie']).toBeUndefined();
    });

    it('answers null for an anonymous visitor rather than erroring', async () => {
      const response = await request(app).get('/api/v1/auth/session');

      expect(response.status).toBe(200);
      expect(response.body.data).toBeNull();
    });

    it('answers null for a revoked token without revoking the family', async () => {
      const login = await request(app).post('/api/v1/auth/login').send({ email, password });
      const cookie = (login.headers['set-cookie'] as unknown as string[])
        .find((entry) => entry.startsWith('academy_rt='))!
        .split(';')[0]!;

      await request(app).post('/api/v1/auth/logout').set('cookie', cookie);

      const response = await request(app).get('/api/v1/auth/session').set('cookie', cookie);
      expect(response.status).toBe(200);
      expect(response.body.data).toBeNull();

      // A read must not trip reuse detection: signing in again still works.
      const again = await request(app).post('/api/v1/auth/login').send({ email, password });
      expect(again.status).toBe(200);
    });

    /**
     * The asymmetry that keeps cookie authentication from being a CSRF hole.
     * If a write ever starts accepting the cookie, this fails.
     */
    it('authenticates a GET from the cookie alone', async () => {
      const login = await request(app).post('/api/v1/auth/login').send({ email, password });
      const cookie = (login.headers['set-cookie'] as unknown as string[])
        .find((entry) => entry.startsWith('academy_rt='))!
        .split(';')[0]!;

      const response = await request(app).get('/api/v1/account/profile').set('cookie', cookie);

      expect(response.status).toBe(200);
      expect(response.body.data.email).toBe(email);
    });

    it('refuses every write authenticated only by the cookie', async () => {
      const login = await request(app).post('/api/v1/auth/login').send({ email, password });
      const cookie = (login.headers['set-cookie'] as unknown as string[])
        .find((entry) => entry.startsWith('academy_rt='))!
        .split(';')[0]!;

      const writes = [
        request(app).patch('/api/v1/account/profile').set('cookie', cookie).send({ name: 'Hacked' }),
        request(app).patch('/api/v1/account/preferences').set('cookie', cookie).send({ theme: 'dark' }),
        request(app).post('/api/v1/account/enrollments').set('cookie', cookie).send({ courseId: 'x' }),
        request(app).post('/api/v1/auth/logout-all').set('cookie', cookie),
      ];

      for (const response of await Promise.all(writes)) {
        expect(response.status).toBe(401);
      }

      // And the name really was not changed.
      const profile = await request(app).get('/api/v1/account/profile').set('cookie', cookie);
      expect(profile.body.data.name).not.toBe('Hacked');
    });

    it('refuses admin reads from a learner cookie', async () => {
      const login = await request(app).post('/api/v1/auth/login').send({ email, password });
      const cookie = (login.headers['set-cookie'] as unknown as string[])
        .find((entry) => entry.startsWith('academy_rt='))!
        .split(';')[0]!;

      // Cookie auth must not widen what a principal is allowed to see.
      const response = await request(app).get('/api/v1/admin/users').set('cookie', cookie);
      expect(response.status).toBe(403);
    });

    it('reports admin capability so the server can gate /admin', async () => {
      const login = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'admin@academy.local', password: 'Admin123!Change' });

      // Skip when the seeded owner password has been changed locally.
      if (login.status !== 200) return;

      const cookie = (login.headers['set-cookie'] as unknown as string[])
        .find((entry) => entry.startsWith('academy_rt='))!
        .split(';')[0]!;

      const response = await request(app).get('/api/v1/auth/session').set('cookie', cookie);

      expect(response.body.data.canAccessAdmin).toBe(true);
      expect(response.body.data.isSuperAdmin).toBe(true);
    });
  });

  describe('password reset', () => {
    it('responds the same way whether or not the account exists', async () => {
      const known = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email });
      const unknown = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'nobody@example.test' });

      expect(known.status).toBe(200);
      expect(unknown.status).toBe(200);
      expect(known.body.data.message).toBe(unknown.body.data.message);
    });

    it('rejects an invalid reset token', async () => {
      const response = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({
          token: 'a'.repeat(40),
          password: 'AnotherStr0ng',
          confirmPassword: 'AnotherStr0ng',
        });

      expect(response.status).toBe(400);
    });
  });

  describe('authorization', () => {
    beforeAll(async () => {
      // The refresh-reuse test above deliberately bumps `tokenVersion`, which
      // invalidates every access token this user holds — that is the whole
      // point of reuse detection. Sign in again so the assertions below test
      // authorization (403) rather than an expired session (401).
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({ email, password });
      accessToken = response.body.data.accessToken;
    });

    it('refuses admin endpoints to a learner', async () => {
      const response = await request(app)
        .get('/api/v1/admin/users')
        .set('authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('AUTHORIZATION_ERROR');
    });

    it('refuses admin endpoints to an anonymous caller', async () => {
      await request(app).get('/api/v1/admin/users').expect(401);
      await request(app).get('/api/v1/admin/overview').expect(401);
      await request(app).get('/api/v1/admin/settings').expect(401);
    });

    it('refuses account endpoints to an anonymous caller', async () => {
      await request(app).get('/api/v1/account/dashboard').expect(401);
      await request(app).get('/api/v1/account/profile').expect(401);
      await request(app).get('/api/v1/account/enrollments').expect(401);
    });
  });
});
