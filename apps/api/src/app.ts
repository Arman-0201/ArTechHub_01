import path from 'node:path';
import express, { type Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { ok } from './lib/http.js';
import { requestContext, resolveLocale } from './middleware/context.js';
import { globalLimiter } from './middleware/rate-limit.js';
import { maintenanceGate } from './middleware/feature-gate.js';
import { optionalAuth } from './middleware/authenticate.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { apiRouter } from './routes/index.js';
import { prisma } from './lib/prisma.js';

/**
 * Application assembly.
 *
 * Middleware order is load-bearing and reads top-to-bottom as the path a
 * request takes: identify it, secure it, parse it, localise it, gate it,
 * route it, and finally normalise whatever went wrong.
 */
export function createApp(): Express {
  const app = express();

  // Behind a proxy, `req.ip` must come from X-Forwarded-For or every rate limit
  // would key on the load balancer and apply globally. Only trusted when the
  // deployment says so — otherwise the header is client-controlled and could be
  // used to evade limits.
  app.set('trust proxy', env.TRUST_PROXY ? 1 : false);
  app.disable('x-powered-by');

  app.use(requestContext);

  app.use(
    helmet({
      // The API serves JSON and uploaded files, never HTML, so a restrictive
      // default CSP is safe here. The web app sets its own.
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'none'"],
          formAction: ["'none'"],
        },
      },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      referrerPolicy: { policy: 'no-referrer' },
      hsts: env.isProduction ? { maxAge: 31_536_000, includeSubDomains: true } : false,
    }),
  );

  app.use(
    cors({
      // An allowlist, not a reflector: `credentials: true` with a reflected
      // origin would let any site drive an authenticated request.
      origin(origin, callback) {
        if (!origin) return callback(null, true); // curl, server-side fetch
        if (env.corsOrigins.includes(origin)) return callback(null, true);
        return callback(new Error('Origin not allowed by CORS'), false);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Locale', 'X-Request-Id'],
      exposedHeaders: ['X-Request-Id'],
      maxAge: 86_400,
    }),
  );

  app.use(compression());
  // A 1MB ceiling on JSON: rich-text documents are large, arbitrary payloads
  // should not be.
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());

  if (!env.isTest) {
    app.use(
      pinoHttp({
        logger,
        genReqId: (req) => (req as { requestId?: string }).requestId ?? 'unknown',
        autoLogging: {
          ignore: (req) => req.url === '/health' || req.method === 'OPTIONS',
        },
        customLogLevel(_req, res, error) {
          if (error || res.statusCode >= 500) return 'error';
          if (res.statusCode >= 400) return 'warn';
          return 'info';
        },
      }),
    );
  }

  app.use(globalLimiter);

  app.get('/health', (_req, res) => {
    ok(res, { status: 'ok', uptime: Math.round(process.uptime()), version: '1.0.0' });
  });

  app.get('/health/ready', (_req, res, next) => {
    // Readiness means "can serve traffic", which requires the database.
    prisma
      .$queryRaw`SELECT 1`
      .then(() => ok(res, { status: 'ready' }))
      .catch(next);
  });

  // Locally served uploads. In production the storage driver is S3 and this
  // path is unused, but it keeps development free of extra infrastructure.
  if (env.STORAGE_DRIVER === 'local') {
    app.use(
      '/uploads',
      express.static(env.uploadsDir, {
        index: false,
        dotfiles: 'deny',
        maxAge: '365d',
        immutable: true,
        setHeaders(res) {
          // Uploaded files are user content: never let a browser sniff one into
          // something executable, and never render one inline as a document.
          res.setHeader('X-Content-Type-Options', 'nosniff');
          res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
        },
      }),
    );
  }

  // `optionalAuth` runs before the gates so maintenance mode can recognise an
  // administrator; each router still applies its own authentication.
  app.use('/api/v1', optionalAuth, resolveLocale, maintenanceGate, apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export const uploadsPath = path.join(env.apiRoot, env.STORAGE_LOCAL_DIR);
