import { PERMISSIONS, type Permission } from './permissions.js';

/**
 * Real-time contract.
 *
 * One socket per open tab, for every visitor, carrying "this changed" notices
 * so a page reflects the platform as it is rather than as it was when it
 * loaded. Three audiences share the connection, and which of them a socket
 * belongs to is decided once, at the handshake, from the credential it
 * presented:
 *
 *   - **public** — everyone, including anonymous visitors. Coarse channels
 *     ("the catalogue moved"), no ids, no actor, no timing detail beyond the
 *     fact that something changed.
 *   - **learner** — any signed-in account, about its own data only: its
 *     enrollments, its progress, its orders.
 *   - **admin** — an account holding an admin permission, about the resources
 *     it may read.
 *
 * Deliberately thin at every level: an event names *what* changed, never
 * carries the new row. The client refetches through the normal authorised
 * endpoint, so a socket can never become a second, unguarded read path — a
 * subscriber learns only that something it is already allowed to read has
 * moved. That property is what makes it safe to hand the same socket to an
 * anonymous visitor and to a superadmin.
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

/**
 * Who a socket is, decided at the handshake and fixed for its lifetime.
 *
 * Cumulative rather than exclusive: every socket is `public`, a signed-in one
 * is also `learner`, and one holding an admin permission is also `admin`. A
 * socket is never told about an audience it does not hold, so widening the feed
 * to anonymous visitors could not widen what an anonymous visitor learns.
 */
export const REALTIME_AUDIENCES = {
  PUBLIC: 'public',
  LEARNER: 'learner',
  ADMIN: 'admin',
} as const;

export type RealtimeAudience = (typeof REALTIME_AUDIENCES)[keyof typeof REALTIME_AUDIENCES];

/** Close codes above 4000 are application-defined; these are ours. */
export const REALTIME_CLOSE = {
  /** Credentials were presented but are malformed or for an unusable account. */
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

/* --------------------------------------------------------------- public */

/**
 * What a visitor's page might be showing.
 *
 * Coarse on purpose. An admin event names a record; a public event names an
 * area of the site, because the recipient may be anonymous and the change may
 * concern something not yet published. "The catalogue moved" is enough for a
 * page to re-render itself from the public API — which shows published content
 * and nothing else — while telling a stranger nothing about what was edited,
 * by whom, or whether it is visible to them at all.
 */
export const REALTIME_PUBLIC_CHANNELS = {
  /** Courses, categories, instructors — anything in the course catalogue. */
  CATALOG: 'catalog',
  /** CMS pages and their sections, articles, legal documents. */
  CONTENT: 'content',
  /** Menus, footer, site settings, active languages — the chrome. */
  NAVIGATION: 'navigation',
  /** Shop products and their prices. */
  COMMERCE: 'commerce',
  /** Feature flags and maintenance mode: what the site currently offers. */
  PLATFORM: 'platform',
} as const;

export type RealtimePublicChannel =
  (typeof REALTIME_PUBLIC_CHANNELS)[keyof typeof REALTIME_PUBLIC_CHANNELS];

/**
 * Something changed in an area of the public site.
 *
 * No actor, no target, no id — deliberately. This event reaches anonymous
 * visitors, so everything it carries is something a stranger may know.
 */
export interface RealtimePublicChangeEvent {
  type: 'public.changed';
  channels: RealtimePublicChannel[];
  at: string;
}

/* -------------------------------------------------------------- learner */

/**
 * A signed-in account's own data.
 *
 * Delivered only to that account's sockets. The topics are the things a
 * learner can see change without having caused it themselves: an admin
 * granting an enrollment, a payment clearing, or the same person completing a
 * lesson in another tab.
 */
export const REALTIME_LEARNER_TOPICS = {
  ENROLLMENTS: 'enrollments',
  PROGRESS: 'progress',
  ORDERS: 'orders',
  PROFILE: 'profile',
} as const;

export type RealtimeLearnerTopic =
  (typeof REALTIME_LEARNER_TOPICS)[keyof typeof REALTIME_LEARNER_TOPICS];

export interface RealtimeLearnerChangeEvent {
  type: 'learner.changed';
  topics: RealtimeLearnerTopic[];
  at: string;
}

/* ---------------------------------------------------------------- admin */

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
  /** What this socket turned out to be. Anonymous sockets get `['public']`. */
  audiences: RealtimeAudience[];
  /** Admin resources this socket will receive, given its permissions. */
  resources: RealtimeResource[];
  /**
   * When the access token behind this socket expires (ISO 8601), or null for an
   * anonymous socket — which presented no session and so has none to outlive.
   */
  sessionExpiresAt: string | null;
  serverTime: string;
}

/** Liveness probe. The client answers with `{ type: 'pong' }`. */
export interface RealtimePingEvent {
  type: 'ping';
  at: string;
}

export type RealtimeServerEvent =
  | RealtimeReadyEvent
  | RealtimeChangeEvent
  | RealtimePublicChangeEvent
  | RealtimeLearnerChangeEvent
  | RealtimePingEvent;

export type RealtimeClientMessage = { type: 'pong' };

export type RealtimeStatus = 'connecting' | 'open' | 'offline' | 'disabled';
