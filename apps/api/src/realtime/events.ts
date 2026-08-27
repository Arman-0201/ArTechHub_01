import {
  REALTIME_PUBLIC_CHANNELS,
  REALTIME_RESOURCES,
  type RealtimeLearnerTopic,
  type RealtimePublicChannel,
  type RealtimeResource,
} from '@academy/types';
import { broadcastChange, broadcastPublic, broadcastToUser } from './hub.js';

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

/* ---------------------------------------------------------------- public */

/**
 * The same audit actions, mapped to the *areas of the site* a visitor might be
 * looking at.
 *
 * Coarser than the admin map on purpose, and that coarseness is the security
 * property. An admin is told "course `abc` was updated by Dana"; a visitor is
 * told "the catalogue moved" and goes to look, through the public API, which
 * shows published content and nothing else. A draft edited into existence and
 * back out again is therefore invisible either way.
 *
 * An action with no entry produces no public event at all. That is the right
 * default: most administrative activity — a role edited, a media file uploaded,
 * an audit log read — changes nothing a visitor can see, and re-rendering every
 * open page to discover that would be pure waste.
 */
const PUBLIC_CHANNELS_BY_ACTION_PREFIX: Record<string, RealtimePublicChannel[]> = {
  course: [REALTIME_PUBLIC_CHANNELS.CATALOG],
  lesson: [REALTIME_PUBLIC_CHANNELS.CATALOG],
  module: [REALTIME_PUBLIC_CHANNELS.CATALOG],
  category: [REALTIME_PUBLIC_CHANNELS.CATALOG],
  instructor: [REALTIME_PUBLIC_CHANNELS.CATALOG],
  page: [REALTIME_PUBLIC_CHANNELS.CONTENT],
  section: [REALTIME_PUBLIC_CHANNELS.CONTENT],
  blog: [REALTIME_PUBLIC_CHANNELS.CONTENT],
  legal: [REALTIME_PUBLIC_CHANNELS.CONTENT],
  menu: [REALTIME_PUBLIC_CHANNELS.NAVIGATION],
  language: [REALTIME_PUBLIC_CHANNELS.NAVIGATION],
  translations: [REALTIME_PUBLIC_CHANNELS.NAVIGATION],
  product: [REALTIME_PUBLIC_CHANNELS.COMMERCE],
  // Settings carry both the chrome (site name, footer, social links) and the
  // switch that puts the whole site into maintenance.
  settings: [REALTIME_PUBLIC_CHANNELS.NAVIGATION, REALTIME_PUBLIC_CHANNELS.PLATFORM],
  feature: [REALTIME_PUBLIC_CHANNELS.PLATFORM],
};

export function publicChannelsForAction(action: string): RealtimePublicChannel[] {
  const prefix = action.split('.')[0] ?? '';
  return PUBLIC_CHANNELS_BY_ACTION_PREFIX[prefix] ?? [];
}

/* ------------------------------------------------------------ announcing */

export interface AuditedChange {
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  actor?: { id: string | null; name: string | null };
}

/**
 * Announces an audited change — in detail to the admins entitled to it, and in
 * outline to everyone looking at the part of the site it touched.
 *
 * One call, two very different messages. Deriving both here rather than at the
 * call sites is what keeps them from drifting: there is no way to add an admin
 * broadcast and forget the public one, or to leak an actor's name into the
 * public one by copying the wrong object.
 */
export function announceAuditedChange(change: AuditedChange): void {
  broadcastChange({
    resources: resourcesForAction(change.action),
    action: change.action,
    targetType: change.targetType ?? null,
    targetId: change.targetId ?? null,
    ...(change.actor ? { actor: change.actor } : {}),
  });

  broadcastPublic(publicChannelsForAction(change.action));
}

/**
 * Announces a change to one account's own data.
 *
 * Not derived from the audit trail, deliberately. An audit entry records who
 * *acted*; this needs to know who was *affected*, and the two differ in exactly
 * the cases that matter — an administrator granting an enrollment, a payment
 * webhook clearing an order. So the call sites name the learner explicitly.
 */
export function announceLearnerChange(
  userId: string | null | undefined,
  topics: RealtimeLearnerTopic[],
): void {
  if (!userId) return;
  broadcastToUser(userId, topics);
}
