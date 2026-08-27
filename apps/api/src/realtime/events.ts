import { REALTIME_RESOURCES, type RealtimeResource } from '@academy/types';
import { broadcastChange } from './hub.js';

/**
 * Audit actions to the admin screens they move.
 *
 * The audit trail is already the one place every deliberate administrative
 * change passes through, which makes it the natural source for the live feed:
 * one hook there keeps every module broadcasting without each service growing
 * its own notification call, and an action that is worth recording is exactly
 * an action other admins want to see.
 *
 * Keyed by the prefix before the dot in the action name, so a new
 * `course.archived` is covered the day it is added.
 */
const RESOURCES_BY_ACTION_PREFIX: Record<string, RealtimeResource[]> = {
  user: [REALTIME_RESOURCES.USERS],
  role: [REALTIME_RESOURCES.ROLES, REALTIME_RESOURCES.USERS],
  course: [REALTIME_RESOURCES.COURSES],
  // A lesson lives inside a course; the course list shows lesson counts and
  // durations, so both screens are stale after either changes.
  lesson: [REALTIME_RESOURCES.COURSES],
  module: [REALTIME_RESOURCES.COURSES],
  category: [REALTIME_RESOURCES.CATEGORIES, REALTIME_RESOURCES.COURSES],
  instructor: [REALTIME_RESOURCES.INSTRUCTORS, REALTIME_RESOURCES.COURSES],
  enrollment: [REALTIME_RESOURCES.ENROLLMENTS, REALTIME_RESOURCES.COURSES],
  page: [REALTIME_RESOURCES.PAGES],
  section: [REALTIME_RESOURCES.PAGES],
  menu: [REALTIME_RESOURCES.MENUS],
  media: [REALTIME_RESOURCES.MEDIA],
  blog: [REALTIME_RESOURCES.BLOG],
  legal: [REALTIME_RESOURCES.LEGAL],
  product: [REALTIME_RESOURCES.PRODUCTS],
  order: [REALTIME_RESOURCES.ORDERS],
  language: [REALTIME_RESOURCES.LANGUAGES],
  translations: [REALTIME_RESOURCES.LANGUAGES],
  settings: [REALTIME_RESOURCES.SETTINGS],
  feature: [REALTIME_RESOURCES.FEATURES],
};

/**
 * Every audited change also moves the audit log itself and the dashboard
 * counters, so both ride along on all of them. A recipient without
 * `audit.read` or `analytics.read` has them filtered out again by the hub.
 */
const ALWAYS: RealtimeResource[] = [REALTIME_RESOURCES.AUDIT, REALTIME_RESOURCES.OVERVIEW];

export function resourcesForAction(action: string): RealtimeResource[] {
  const prefix = action.split('.')[0] ?? '';
  const mapped = RESOURCES_BY_ACTION_PREFIX[prefix] ?? [];
  return [...new Set([...mapped, ...ALWAYS])];
}

export interface AuditedChange {
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  actor?: { id: string | null; name: string | null };
}

/** Announces an audited change to connected admins. */
export function announceAuditedChange(change: AuditedChange): void {
  broadcastChange({
    resources: resourcesForAction(change.action),
    action: change.action,
    targetType: change.targetType ?? null,
    targetId: change.targetId ?? null,
    ...(change.actor ? { actor: change.actor } : {}),
  });
}
