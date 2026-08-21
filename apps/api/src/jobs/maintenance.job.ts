import { logger } from '../lib/logger.js';
import { pruneExpiredTokens } from '../modules/auth/auth.service.js';

/**
 * Background maintenance.
 *
 * Deliberately `setInterval` rather than a job queue: there is exactly one
 * recurring task and it is idempotent, so the operational cost of Redis and a
 * worker process would buy nothing. If scheduled work grows beyond this, the
 * `startMaintenanceJobs` seam is where a real scheduler plugs in.
 */

const PRUNE_INTERVAL_MS = 6 * 60 * 60 * 1000;

let pruneTimer: NodeJS.Timeout | null = null;

async function runPrune(): Promise<void> {
  try {
    const result = await pruneExpiredTokens();
    if (result.refresh > 0 || result.verification > 0) {
      logger.info(result, 'Pruned expired auth tokens');
    }
  } catch (error) {
    // A failed sweep is not fatal; expired tokens are already rejected on use.
    logger.error({ err: error }, 'Token prune failed');
  }
}

export function startMaintenanceJobs(): void {
  if (pruneTimer) return;

  // Run once shortly after boot so a long-running deployment does not wait six
  // hours for the first sweep.
  const initial = setTimeout(() => void runPrune(), 30_000);
  initial.unref();

  pruneTimer = setInterval(() => void runPrune(), PRUNE_INTERVAL_MS);
  // Do not hold the event loop open during shutdown.
  pruneTimer.unref();
}

export function stopMaintenanceJobs(): void {
  if (pruneTimer) {
    clearInterval(pruneTimer);
    pruneTimer = null;
  }
}
