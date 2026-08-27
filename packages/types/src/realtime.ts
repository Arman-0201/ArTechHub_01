import { PERMISSIONS, type Permission } from './permissions.js';

/**
 * Admin real-time contract.
 *
 * The admin panel is a set of long-lived screens over data several people
 * change at once. Polling every list would be wasteful and still lag; a single
 * socket per admin, carrying "this resource changed" notices, keeps every open
 * screen honest without any screen knowing the socket exists.
 *
 * Deliberately thin: an event names *what* changed, never carries the new row.
 * The client refetches through the normal authorised endpoint, so a socket can
 * never become a second, unguarded read path — a subscriber learns only that
 * something it is already allowed to read has moved.
 */

/** Upgrade path on the API. Not routed through Express — see `realtime/hub.ts`. */
export const REALTIME_PATH = '/api/v1/realtime';

/**
 * Subprotocol handshake.
 *
 * A browser `WebSocket` cannot set an `Authorization` header, and a token in
 * the query string ends up in access logs and proxy traces. The bearer travels
 * as a second subprotocol token instead: it stays in a request header, and the
 * server echoes back only `REALTIME_SUBPROTOCOL` so the credential is never
 * reflected.
 */
export const REALTIME_SUBPROTOCOL = 'academy.v1';
export const REALTIME_BEARER_PREFIX = 'bearer.';

/** Close codes above 4000 are application-defined; these are ours. */
export const REALTIME_CLOSE = {
  /** Credentials missing, malformed, or for an account that cannot sign in. */
  UNAUTHENTICATED: 4401,
  /** Authenticated, but holds no admin permission. */
  FORBIDDEN: 4403,
  /** The access token behind this socket expired — reconnect with a fresh one. */
  TOKEN_EXPIRED: 4440,
  /** Too many sockets open for one account. */
  TOO_MANY: 4429,
  /** The API is shutting down. Reconnect; do not treat as an error. */
  GOING_AWAY: 4503,
} as const;

/**
 * Resources an admin screen can be looking at.
 *
 * Each maps to the query-key prefixes the client invalidates, and to the
 * permission a socket must hold to be told about it at all — an editor who
 * cannot read users is never informed that a user changed.
 */
export const REALTIME_RESOURCES = {
  USERS: 'users',
  ROLES: 'roles',
  COURSES: 'courses',
  CATEGORIES: 'categories',
  INSTRUCTORS: 'instructors',
  ENROLLMENTS: 'enrollments',
  PAGES: 'pages',
  MENUS: 'menus',
  MEDIA: 'media',
  BLOG: 'blog',
  LEGAL: 'legal',
  PRODUCTS: 'products',
  ORDERS: 'orders',
  LANGUAGES: 'languages',
  SETTINGS: 'settings',
  FEATURES: 'features',
  AUDIT: 'audit',
  OVERVIEW: 'overview',
} as const;

export type RealtimeResource = (typeof REALTIME_RESOURCES)[keyof typeof REALTIME_RESOURCES];

/** The permission a socket must hold to receive events for a resource. */
export const REALTIME_RESOURCE_PERMISSION: Record<RealtimeResource, Permission> = {
  [REALTIME_RESOURCES.USERS]: PERMISSIONS.USERS_READ,
  [REALTIME_RESOURCES.ROLES]: PERMISSIONS.ROLES_READ,
  [REALTIME_RESOURCES.COURSES]: PERMISSIONS.COURSES_READ,
  [REALTIME_RESOURCES.CATEGORIES]: PERMISSIONS.CATEGORIES_READ,
  [REALTIME_RESOURCES.INSTRUCTORS]: PERMISSIONS.COURSES_READ,
  [REALTIME_RESOURCES.ENROLLMENTS]: PERMISSIONS.ENROLLMENTS_READ,
  [REALTIME_RESOURCES.PAGES]: PERMISSIONS.PAGES_READ,
  [REALTIME_RESOURCES.MENUS]: PERMISSIONS.MENUS_MANAGE,
  [REALTIME_RESOURCES.MEDIA]: PERMISSIONS.MEDIA_READ,
  [REALTIME_RESOURCES.BLOG]: PERMISSIONS.BLOG_READ,
  [REALTIME_RESOURCES.LEGAL]: PERMISSIONS.LEGAL_MANAGE,
  [REALTIME_RESOURCES.PRODUCTS]: PERMISSIONS.PRODUCTS_READ,
  [REALTIME_RESOURCES.ORDERS]: PERMISSIONS.ORDERS_READ,
  [REALTIME_RESOURCES.LANGUAGES]: PERMISSIONS.LANGUAGES_MANAGE,
  [REALTIME_RESOURCES.SETTINGS]: PERMISSIONS.SETTINGS_MANAGE,
  [REALTIME_RESOURCES.FEATURES]: PERMISSIONS.FEATURES_MANAGE,
  [REALTIME_RESOURCES.AUDIT]: PERMISSIONS.AUDIT_READ,
  [REALTIME_RESOURCES.OVERVIEW]: PERMISSIONS.ANALYTICS_READ,
};

/** Who caused a change. Present unless the platform itself did it. */
export interface RealtimeActor {
  id: string | null;
  name: string | null;
}

export interface RealtimeChangeEvent {
  type: 'resource.changed';
  /**
   * Everything this one change invalidates — editing a lesson moves the course
   * list, the audit trail and the dashboard counters at once. Narrowed per
   * socket to the resources that socket is allowed to read, so the list itself
   * never discloses the existence of a screen the recipient cannot open.
   */
  resources: RealtimeResource[];
  /** The audit action that caused it, e.g. `course.updated`. */
  action: string;
  targetType: string | null;
  targetId: string | null;
  actor: RealtimeActor;
  /** ISO 8601. */
  at: string;
}

/** Sent once on connect so the client can render state before anything changes. */
export interface RealtimeReadyEvent {
  type: 'ready';
  /** Resources this socket will actually receive, given its permissions. */
  resources: RealtimeResource[];
  /** When the access token behind this socket expires (ISO 8601). */
  sessionExpiresAt: string;
  serverTime: string;
}

/** Liveness probe. The client answers with `{ type: 'pong' }`. */
export interface RealtimePingEvent {
  type: 'ping';
  at: string;
}

export type RealtimeServerEvent = RealtimeReadyEvent | RealtimeChangeEvent | RealtimePingEvent;

export type RealtimeClientMessage = { type: 'pong' };

export type RealtimeStatus = 'connecting' | 'open' | 'offline' | 'disabled';
