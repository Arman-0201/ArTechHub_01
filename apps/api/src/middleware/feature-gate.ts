import type { RequestHandler } from 'express';
import type { FeatureKey } from '@academy/types';
import { FeatureDisabledError, MaintenanceModeError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { isFeatureEnabled } from '../modules/feature-flags/feature-flags.service.js';
import { isMaintenanceMode } from '../modules/settings/settings.service.js';

/**
 * Server-side enforcement of a feature flag.
 *
 * Hiding a nav link is a UX nicety; this is the actual control. A disabled
 * feature answers 404 rather than 403 so a probe cannot distinguish
 * "exists but off" from "does not exist".
 */
export function requireFeature(...keys: FeatureKey[]): RequestHandler {
  return (_req, _res, next) => {
    void (async () => {
      try {
        for (const key of keys) {
          if (!(await isFeatureEnabled(key))) {
            throw new FeatureDisabledError(key);
          }
        }
        next();
      } catch (error) {
        next(error);
      }
    })();
  };
}

/**
 * Maintenance mode.
 *
 * Blocks public traffic while leaving three doors open: the health check (so
 * orchestrators do not cycle the container), the auth routes and anything under
 * `/admin` (so an operator can sign in and turn maintenance back off).
 */
export const maintenanceGate: RequestHandler = (req, _res, next) => {
  void (async () => {
    try {
      if (req.method === 'GET' && req.path === '/health') {
        next();
        return;
      }

      const isExempt =
        req.path.startsWith('/api/v1/auth') ||
        req.path.startsWith('/api/v1/admin') ||
        req.path.startsWith('/api/v1/site/bootstrap');

      if (isExempt) {
        next();
        return;
      }

      let maintenanceMode = false;
      try {
        maintenanceMode = await isMaintenanceMode();
      } catch (error) {
        // Maintenance mode is an operator convenience, not a security control,
        // and this check runs on every request. If the settings lookup fails —
        // a cold cache during a database blip — failing open lets the rest of
        // the pipeline answer correctly (401, 422, 404) instead of turning
        // every endpoint into a misleading 500.
        logger.error({ err: error }, 'Maintenance mode check failed; continuing');
      }

      if (maintenanceMode) {
        // Staff with any admin permission keep working during maintenance.
        if (req.user && (req.user.isSuperAdmin || req.user.permissions.size > 0)) {
          next();
          return;
        }
        throw new MaintenanceModeError();
      }

      next();
    } catch (error) {
      next(error);
    }
  })();
};
