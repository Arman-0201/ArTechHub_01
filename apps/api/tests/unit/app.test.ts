import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import '../setup.js';

/**
 * Application assembly.
 *
 * These run without a database: they check the parts of the request pipeline
 * that are decided before any query happens — headers, CORS, the error
 * envelope, and the gates on each router.
 */
describe('application', () => {
  let app: Express;

  beforeAll(async () => {
    const { createApp } = await import('../../src/app.js');
    app = createApp();
  });

  describe('health', () => {
    it('responds without touching the database', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe('ok');
      expect(response.body.data.uptime).toBeTypeOf('number');
    });
  });

  describe('security headers', () => {
    it('sets the headers that matter', async () => {
      const response = await request(app).get('/health');

      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['referrer-policy']).toBe('no-referrer');
      expect(response.headers['content-security-policy']).toContain("default-src 'none'");
      expect(response.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    });

    it('does not advertise the framework', async () => {
      const response = await request(app).get('/health');
      expect(response.headers['x-powered-by']).toBeUndefined();
    });

    it('returns a correlation id on every response', async () => {
      const response = await request(app).get('/health');
      expect(response.headers['x-request-id']).toMatch(/^[A-Za-z0-9._-]{8,64}$/);
    });

    it('accepts a well-formed inbound correlation id', async () => {
      const response = await request(app).get('/health').set('x-request-id', 'trace-abc-123');
      expect(response.headers['x-request-id']).toBe('trace-abc-123');
    });

    it('replaces a malformed inbound correlation id', async () => {
      // A crafted value must not be echoed into a response header or a log
      // line. Node refuses to transmit a header containing a raw newline, so
      // this uses values that do reach the server and still fail the guard.
      for (const crafted of ['id with spaces', '<script>alert(1)</script>', 'x'.repeat(200)]) {
        const response = await request(app).get('/health').set('x-request-id', crafted);
        expect(response.headers['x-request-id']).not.toBe(crafted);
        expect(response.headers['x-request-id']).toMatch(/^[A-Za-z0-9._-]{8,64}$/);
      }
    });
  });

  describe('CORS', () => {
    it('allows a configured origin with credentials', async () => {
      const response = await request(app)
        .get('/health')
        .set('origin', 'http://localhost:3000');

      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });

    it('does not reflect an unlisted origin', async () => {
      const response = await request(app).get('/health').set('origin', 'https://evil.example');

      // Reflecting the origin while allowing credentials would let any site
      // drive an authenticated request.
      expect(response.headers['access-control-allow-origin']).not.toBe('https://evil.example');
    });
  });

  describe('error envelope', () => {
    it('returns the standard shape for an unknown route', async () => {
      const response = await request(app).get('/api/v1/definitely-not-a-route');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('NOT_FOUND');
      expect(response.body.error.requestId).toBeTruthy();
    });

    it('rejects malformed JSON with a 400, not a crash', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .set('content-type', 'application/json')
        .send('{ not json');

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('BAD_REQUEST');
    });

    it('never leaks a stack trace in the message', async () => {
      const response = await request(app).get('/api/v1/definitely-not-a-route');
      expect(JSON.stringify(response.body)).not.toContain('    at ');
    });
  });

  describe('router gates', () => {
    it('requires authentication on the account router', async () => {
      for (const path of ['/api/v1/account/profile', '/api/v1/account/dashboard']) {
        const response = await request(app).get(path);
        expect(response.status).toBe(401);
        expect(response.body.error.code).toBe('AUTHENTICATION_ERROR');
      }
    });

    it('requires authentication on the admin router', async () => {
      for (const path of ['/api/v1/admin/users', '/api/v1/admin/settings', '/api/v1/admin/overview']) {
        const response = await request(app).get(path);
        expect(response.status).toBe(401);
      }
    });

    it('rejects a forged bearer token', async () => {
      const response = await request(app)
        .get('/api/v1/account/profile')
        .set('authorization', 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhZG1pbiJ9.forged');

      expect(response.status).toBe(401);
    });
  });

  describe('input validation', () => {
    it('rejects an invalid body before any handler runs', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'not-an-email' });

      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.fields).toBeDefined();
    });
  });
});
