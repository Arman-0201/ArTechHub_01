import type { Server } from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { disconnectPrisma, prisma } from './lib/prisma.js';
import { ensureLocalStorageReady } from './lib/storage.js';
import { startMaintenanceJobs, stopMaintenanceJobs } from './jobs/maintenance.job.js';
import { attachRealtime, closeRealtime } from './realtime/hub.js';

async function bootstrap(): Promise<void> {
  // Fail fast on a bad database URL rather than serving 500s until someone
  // notices.
  await prisma.$connect();
  await ensureLocalStorageReady();

  const app = createApp();
  const server: Server = app.listen(env.API_PORT, () => {
    logger.info(
      { port: env.API_PORT, env: env.NODE_ENV, storage: env.STORAGE_DRIVER },
      `API listening on ${env.API_PUBLIC_URL}`,
    );
  });

  // The realtime hub hangs off the same HTTP server rather than a port of its
  // own: one origin, one TLS certificate, and the CORS allowlist already
  // describes who may connect.
  attachRealtime(server);

  startMaintenanceJobs();

  /**
   * Graceful shutdown: stop accepting connections, let in-flight requests
   * finish, then close the database pool. The 15s cap prevents one hung request
   * from blocking a deploy indefinitely.
   */
  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Shutting down');

    stopMaintenanceJobs();
    // Closed before `server.close()`, which waits for open connections: a
    // WebSocket never closes on its own, so leaving them up would stall the
    // shutdown until the timeout fires every time.
    closeRealtime();

    const forceExit = setTimeout(() => {
      logger.warn('Forcing shutdown after timeout');
      process.exit(1);
    }, 15_000);
    forceExit.unref();

    server.close(() => {
      void disconnectPrisma().then(() => {
        clearTimeout(forceExit);
        process.exit(0);
      });
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason }, 'Unhandled promise rejection');
  });

  process.on('uncaughtException', (error) => {
    // The process state is unknowable after this; log and let the supervisor
    // restart rather than limping on.
    logger.fatal({ err: error }, 'Uncaught exception');
    shutdown('uncaughtException');
  });
}

bootstrap().catch((error) => {
  logger.fatal({ err: error }, 'Failed to start the API');
  process.exit(1);
});
