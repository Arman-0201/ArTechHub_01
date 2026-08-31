import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer } from 'ws';
import {
  REALTIME_AUDIENCES,
  REALTIME_BEARER_PREFIX,
  REALTIME_CLOSE,
  REALTIME_PATH,
  REALTIME_RESOURCE_PERMISSION,
  REALTIME_SUBPROTOCOL,
  type RealtimeAudience,
  type RealtimeChangeEvent,
  type RealtimeLearnerTopic,
  type RealtimePublicChannel,
  type RealtimeResource,
  type RealtimeServerEvent,
} from '@academy/types';
import { env } from '../config/env.js';
import { logger, logSecurityEvent } from '../lib/logger.js';
import { resolvePrincipalFromAccessToken } from '../middleware/authenticate.js';
import { verifyAccessToken } from '../lib/jwt.js';
import type { AuthenticatedUser } from '../types/express.js';

/**
 * Real-time hub.
 *
 * One WebSocket per open tab — for every visitor, not only administrators —
 * carrying change notices so a page reflects the platform as it is rather than
 * as it was when it loaded.
 *
 * What a socket receives is decided once, at the handshake, from the credential
 * it presented, and never changes afterwards:
 *
 *   - no credential      → `public` only: coarse channels, no ids, no actor
 *   - a valid session    → `public` + `learner`, the latter scoped to that
 *                          account and delivered to nobody else
 *   - an admin session   → the above plus `admin`, narrowed to the resources
 *                          that account may read
 *
 * Four things this deliberately is not:
 *
 *   - *A data channel.* Events name what changed; the client refetches through
 *     the ordinary authorised endpoint. A socket can therefore never become a
 *     second read path that skips a permission check — which is what makes it
 *     safe to hand one to an anonymous visitor.
 *   - *A command channel.* The only message the server accepts from a client is
 *     `pong`. Every write still goes through the HTTP API, with its validation,
 *     rate limits and audit trail intact.
 *   - *A subscription protocol.* A client cannot ask to be told about anything;
 *     it is told what its audience entitles it to. There is nothing to send
 *     that could widen a socket's reach.
 *   - *Shared across instances.* The registry below is in-process, so with more
 *     than one API instance a change made on instance A does not reach a client
 *     connected to instance B, and those pages fall back to refreshing on
 *     navigation. Scaling out means publishing the three broadcast functions
 *     over Redis pub/sub; the call sites do not change. See
 *     docs/architecture.md.
 */

/** Sockets one account may hold open at once: a few tabs, not a leak. */
const MAX_SOCKETS_PER_USER = 6;

/**
 * Sockets one address may hold open at once.
 *
 * Generous, because an address is a poor proxy for a person: a university, an
 * office or a mobile carrier's NAT puts hundreds of genuine visitors behind
 * one. It is here to bound a single abusive client, not to ration seats — and
 * the global anonymous ceiling below is the limit that actually protects
 * memory.
 */
const MAX_SOCKETS_PER_ADDRESS = 64;

/** How often the server probes, and how long a silent client survives. */
const HEARTBEAT_INTERVAL_MS = 30_000;
const HEARTBEAT_GRACE = 2;

/**
 * A slow consumer must not become unbounded server memory. Past this much
 * unsent data the socket is considered wedged and dropped; the client
 * reconnects and refetches, which is the correct recovery anyway.
 */
const MAX_BUFFERED_BYTES = 512 * 1024;

interface Subscriber {
  socket: WebSocket;
  audiences: Set<RealtimeAudience>;
  /** Null for an anonymous socket, which belongs to no account. */
  userId: string | null;
  /** Only for the per-address cap. Never logged, never sent anywhere. */
  address: string | null;
  isSuperAdmin: boolean;
  permissions: Set<string>;
  /** Heartbeats sent since the last answer. Reset by every pong. */
  missedBeats: number;
  /** Null for an anonymous socket: no session to outlive. */
  expiryTimer: NodeJS.Timeout | null;
}

const subscribers = new Set<Subscriber>();

/**
 * Anonymous sockets, counted rather than derived.
 *
 * Walking the set on every handshake would be O(connections) at exactly the
 * moment the server is busiest, which is the wrong shape for a ceiling meant to
 * protect it under load.
 */
let anonymousCount = 0;

let wss: WebSocketServer | null = null;
let heartbeat: NodeJS.Timeout | null = null;

/* ------------------------------------------------------------- handshake */

function offeredProtocols(req: IncomingMessage): string[] {
  const header = req.headers['sec-websocket-protocol'];
  if (!header) return [];

  return (Array.isArray(header) ? header.join(',') : header)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/**
 * The bearer arrives as a subprotocol token because a browser WebSocket cannot
 * set request headers. Only `REALTIME_SUBPROTOCOL` is echoed back, so the
 * credential is never reflected to the client or to anything logging the
 * response.
 *
 * Absent is a legitimate answer, not a failure: an anonymous visitor offers the
 * subprotocol and no bearer, and is given the public feed.
 */
function extractBearer(offered: string[]): string | null {
  const bearer = offered.find((entry) => entry.startsWith(REALTIME_BEARER_PREFIX));
  return bearer ? bearer.slice(REALTIME_BEARER_PREFIX.length) || null : null;
}

/**
 * An allowlist, exactly as the CORS middleware applies to HTTP.
 *
 * The same-origin policy does not constrain WebSockets: any page on any site
 * can open one to this endpoint, so this check is the only thing between a
 * hostile page and a socket opened with a visitor's credentials. A missing
 * Origin is a non-browser client and still has to present a valid token below.
 */
function originAllowed(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  return env.corsOrigins.includes(origin);
}

function reject(socket: Duplex, status: number, reason: string): void {
  socket.write(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}

function countSocketsFor(userId: string): number {
  let count = 0;
  for (const subscriber of subscribers) {
    if (subscriber.userId === userId) count += 1;
  }
  return count;
}

function countSocketsFromAddress(address: string): number {
  let count = 0;
  for (const subscriber of subscribers) {
    if (subscriber.address === address) count += 1;
  }
  return count;
}

/**
 * The visitor's address, for the per-address cap only.
 *
 * A WebSocket upgrade never reaches Express, so `req.ip` — and the hop counting
 * `TRUST_PROXY` configures — is not available here. The same rule is applied by
 * hand: behind a configured number of proxies, the client is the entry that
 * many hops from the right of `X-Forwarded-For`; with none, the header is
 * attacker-controlled and the socket's own address is the only honest answer.
 *
 * The chain is often *shorter* than `TRUST_PROXY` on this endpoint, and that is
 * not a misconfiguration. `TRUST_PROXY` counts the hops on the HTTP path, which
 * in the documented topology includes the web app's own origin proxying
 * `/api/v1/*`; a socket skips that hop, because a route handler cannot forward
 * an upgrade. So the same deployment presents two hops to an API call and one
 * to a handshake.
 *
 * Clamping to the left-most entry is what Express itself does with
 * `trust proxy = n`, and it is why the clamp matters here: indexing past the
 * start yields `undefined`, and the fall-back below is then the *load
 * balancer's* address — identical for every visitor, which collapses the
 * per-address cap into a site-wide ceiling and refuses everyone past the 64th
 * socket.
 */
function clientAddress(req: IncomingMessage): string | null {
  const hops = env.TRUST_PROXY;

  if (hops > 0) {
    const header = req.headers['x-forwarded-for'];
    const chain = (Array.isArray(header) ? header.join(',') : (header ?? ''))
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);

    const candidate = chain[Math.max(0, chain.length - hops)];
    if (candidate) return candidate;
  }

  return req.socket.remoteAddress ?? null;
}

/** `exp` as a date. Read only after the signature has been verified. */
function decodeExpiry(token: string): Date | null {
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      exp?: number;
    };
    return typeof claims.exp === 'number' ? new Date(claims.exp * 1000) : null;
  } catch {
    return null;
  }
}

async function handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
  const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
  if (pathname !== REALTIME_PATH) {
    reject(socket, 404, 'Not Found');
    return;
  }

  if (!originAllowed(req)) {
    logSecurityEvent('realtime.origin_rejected', { origin: req.headers.origin });
    reject(socket, 403, 'Forbidden');
    return;
  }

  /*
   * The subprotocol is required, and checked before anything else about the
   * client is considered.
   *
   * `handleProtocols` below answers with `academy.v1` unconditionally, and a
   * server must not select a subprotocol the client did not offer — a browser
   * rejects such a handshake outright. Refusing here keeps the echoed value
   * honest, and it is also the version marker: a future `academy.v2` can be
   * accepted alongside rather than guessed at.
   */
  const offered = offeredProtocols(req);
  if (!offered.includes(REALTIME_SUBPROTOCOL)) {
    reject(socket, 400, 'Bad Request');
    return;
  }

  const address = clientAddress(req);
  if (address && countSocketsFromAddress(address) >= MAX_SOCKETS_PER_ADDRESS) {
    reject(socket, 429, 'Too Many Requests');
    return;
  }

  const token = extractBearer(offered);

  /*
   * No credential: an anonymous visitor, reading the public site.
   *
   * Accepted rather than refused, because the public pages are the larger half
   * of "the site updates itself". The socket is worth almost nothing to an
   * attacker — it carries coarse channel names and cannot be sent anything —
   * so the only questions are how many of them exist and whether the operator
   * wants them at all.
   */
  if (!token) {
    if (!env.REALTIME_PUBLIC_ENABLED || anonymousCount >= env.REALTIME_MAX_ANONYMOUS) {
      // Refused, not an error: a visitor without the feed reads a page that is
      // correct as of its last load, which is how the site worked before.
      reject(socket, 503, 'Service Unavailable');
      return;
    }

    wss?.handleUpgrade(req, socket, head, (ws) => {
      register(ws, { audiences: [REALTIME_AUDIENCES.PUBLIC], address });
    });
    return;
  }

  let user: AuthenticatedUser | null;
  let expiresAt: Date | null;
  try {
    // Verified before anything is decoded by hand, so the `exp` the socket
    // lifetime is built from is a claim the signature covers. The resolver then
    // re-reads the account and its permissions from the database rather than
    // trusting the token for authorisation.
    verifyAccessToken(token);
    expiresAt = decodeExpiry(token);
    user = await resolvePrincipalFromAccessToken(token);
  } catch {
    reject(socket, 401, 'Unauthorized');
    return;
  }

  // A credential was offered and is not usable. Downgrading to an anonymous
  // socket would be friendlier and wrong: the client believes it is signed in,
  // and it needs to find that out rather than quietly stop receiving its own
  // events.
  if (!user || !expiresAt || user.status === 'SUSPENDED' || user.status === 'INACTIVE') {
    reject(socket, 401, 'Unauthorized');
    return;
  }

  if (countSocketsFor(user.id) >= MAX_SOCKETS_PER_USER) {
    reject(socket, 429, 'Too Many Requests');
    return;
  }

  /*
   * Every signed-in account is a learner on this socket. An admin permission
   * adds the admin feed on top rather than replacing it — an administrator is
   * also a person with enrollments, and the panel and the dashboard are the
   * same browser.
   */
  const audiences: RealtimeAudience[] = [REALTIME_AUDIENCES.PUBLIC, REALTIME_AUDIENCES.LEARNER];
  if (user.isSuperAdmin || user.permissions.size > 0) {
    audiences.push(REALTIME_AUDIENCES.ADMIN);
  }

  const principal = user;
  const sessionExpiresAt = expiresAt;
  wss?.handleUpgrade(req, socket, head, (ws) => {
    register(ws, { audiences, address, user: principal, expiresAt: sessionExpiresAt });
  });
}

/* ------------------------------------------------------------ membership */

function resourcesVisibleTo(subscriber: Subscriber): RealtimeResource[] {
  if (!subscriber.audiences.has(REALTIME_AUDIENCES.ADMIN)) return [];

  const all = Object.keys(REALTIME_RESOURCE_PERMISSION) as RealtimeResource[];
  if (subscriber.isSuperAdmin) return all;
  return all.filter((resource) =>
    subscriber.permissions.has(REALTIME_RESOURCE_PERMISSION[resource]),
  );
}

function send(subscriber: Subscriber, event: RealtimeServerEvent): void {
  if (subscriber.socket.readyState !== WebSocket.OPEN) return;
  if (subscriber.socket.bufferedAmount > MAX_BUFFERED_BYTES) {
    logger.warn({ userId: subscriber.userId }, 'Dropping a wedged realtime socket');
    subscriber.socket.terminate();
    return;
  }
  subscriber.socket.send(JSON.stringify(event));
}

interface Registration {
  audiences: RealtimeAudience[];
  address: string | null;
  /** Absent for an anonymous socket. */
  user?: AuthenticatedUser;
  expiresAt?: Date;
}

function register(socket: WebSocket, registration: Registration): void {
  const { user, expiresAt } = registration;

  const subscriber: Subscriber = {
    socket,
    audiences: new Set(registration.audiences),
    userId: user?.id ?? null,
    address: registration.address,
    isSuperAdmin: user?.isSuperAdmin ?? false,
    permissions: new Set<string>(user?.permissions ?? []),
    missedBeats: 0,
    /**
     * The socket authenticates once, at the handshake, and is never
     * re-authenticated. It therefore must not outlive the token it presented,
     * or revoking someone's access would leave their live feed running until
     * they closed the tab. Closing at expiry hands the decision back to the
     * client, which refreshes and reconnects if it still may.
     *
     * An anonymous socket presented nothing and so has nothing to outlive; the
     * heartbeat is what eventually reaps it.
     */
    expiryTimer: expiresAt
      ? setTimeout(
          () => socket.close(REALTIME_CLOSE.TOKEN_EXPIRED, 'Access token expired'),
          Math.max(1_000, expiresAt.getTime() - Date.now()),
        )
      : null,
  };

  subscribers.add(subscriber);
  if (!subscriber.userId) anonymousCount += 1;

  socket.on('message', (raw) => {
    // The only accepted client message. Anything else is dropped rather than
    // interpreted: this endpoint has no command surface.
    try {
      const message = JSON.parse(raw.toString()) as { type?: string };
      if (message.type === 'pong') subscriber.missedBeats = 0;
    } catch {
      /* A client that cannot speak the protocol is simply ignored. */
    }
  });

  const cleanup = () => {
    // Guarded, because `close` and `error` both fire on a failed socket and the
    // anonymous counter must not drift below the truth.
    if (!subscribers.delete(subscriber)) return;
    if (subscriber.expiryTimer) clearTimeout(subscriber.expiryTimer);
    if (!subscriber.userId) anonymousCount -= 1;
  };
  socket.on('close', cleanup);
  socket.on('error', (error) => {
    logger.debug({ err: error, userId: subscriber.userId }, 'Realtime socket error');
    cleanup();
  });

  send(subscriber, {
    type: 'ready',
    audiences: [...subscriber.audiences],
    resources: resourcesVisibleTo(subscriber),
    sessionExpiresAt: expiresAt?.toISOString() ?? null,
    serverTime: new Date().toISOString(),
  });

  logger.debug(
    { userId: subscriber.userId, sockets: subscribers.size, anonymous: anonymousCount },
    'Realtime subscriber connected',
  );
}

/* ------------------------------------------------------------- broadcast */

export interface ChangeNotice {
  resources: RealtimeResource[];
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  actor?: { id: string | null; name: string | null };
}

/**
 * Announces a change to every admin entitled to hear about it.
 *
 * Each recipient gets the resource list narrowed to what they may read, and a
 * recipient left with nothing gets no message at all, so the feed never
 * discloses that a screen they cannot open exists.
 *
 * Never throws. Real-time is a convenience layered over a system that works
 * without it, and a broadcast failure must not unwind the operation that
 * triggered it.
 */
export function broadcastChange(notice: ChangeNotice): void {
  if (subscribers.size === 0) return;

  try {
    const at = new Date().toISOString();

    for (const subscriber of subscribers) {
      // The gate that keeps the detailed feed — actor names, target ids, draft
      // records — away from the public and learner sockets that now share this
      // hub. Everything below it assumes an administrator.
      if (!subscriber.audiences.has(REALTIME_AUDIENCES.ADMIN)) continue;

      const visible = subscriber.isSuperAdmin
        ? notice.resources
        : notice.resources.filter((resource) =>
            subscriber.permissions.has(REALTIME_RESOURCE_PERMISSION[resource]),
          );
      if (visible.length === 0) continue;

      const event: RealtimeChangeEvent = {
        type: 'resource.changed',
        resources: visible,
        action: notice.action,
        targetType: notice.targetType ?? null,
        targetId: notice.targetId ?? null,
        actor: { id: notice.actor?.id ?? null, name: notice.actor?.name ?? null },
        at,
      };
      send(subscriber, event);
    }
  } catch (error) {
    logger.error({ err: error, action: notice.action }, 'Failed to broadcast a realtime change');
  }
}

/**
 * Announces that an area of the public site moved.
 *
 * Reaches every socket, anonymous ones included, because every socket holds the
 * public audience. What it carries is the whole reason that is safe: a channel
 * name and a timestamp, never an id, an actor or a publication state. A
 * recipient learns that the catalogue changed, re-renders from the public API,
 * and sees exactly what it was always allowed to see.
 */
export function broadcastPublic(channels: RealtimePublicChannel[]): void {
  if (subscribers.size === 0 || channels.length === 0) return;

  try {
    const at = new Date().toISOString();
    const unique = [...new Set(channels)];

    for (const subscriber of subscribers) {
      if (!subscriber.audiences.has(REALTIME_AUDIENCES.PUBLIC)) continue;
      send(subscriber, { type: 'public.changed', channels: unique, at });
    }
  } catch (error) {
    logger.error({ err: error }, 'Failed to broadcast a public realtime change');
  }
}

/**
 * Announces that one account's own data moved, to that account only.
 *
 * The narrowest of the three: matched on `userId`, so a learner's sockets are
 * the only ones that can receive it. Every tab that person has open hears it,
 * which is what makes completing a lesson in one window update the dashboard in
 * another.
 */
export function broadcastToUser(userId: string, topics: RealtimeLearnerTopic[]): void {
  if (subscribers.size === 0 || topics.length === 0) return;

  try {
    const at = new Date().toISOString();
    const unique = [...new Set(topics)];

    for (const subscriber of subscribers) {
      if (subscriber.userId !== userId) continue;
      if (!subscriber.audiences.has(REALTIME_AUDIENCES.LEARNER)) continue;
      send(subscriber, { type: 'learner.changed', topics: unique, at });
    }
  } catch (error) {
    logger.error({ err: error }, 'Failed to broadcast a learner realtime change');
  }
}

/**
 * Closes every socket belonging to an account, now.
 *
 * A socket authenticates once, at the handshake, and is otherwise bound to its
 * token's expiry. That is the right lifetime for the ordinary case and far too
 * long for the security one: revoking a session, suspending an account or
 * narrowing a role all take effect on the next *HTTP* request — because
 * `tokenVersion` is checked there — while the live feed carries on until the
 * token would have expired anyway. This closes that window.
 *
 * `FORBIDDEN` rather than `TOKEN_EXPIRED`, deliberately. The client treats the
 * former as final and stops reconnecting, which is what should happen to a
 * revoked device; the latter would have it refresh and try again in a loop.
 *
 * For a *narrowed* rather than revoked role this is still right: the account
 * may still connect, and its next handshake re-resolves permissions from the
 * database. Rebuilding a live subscriber's permission set in place would be a
 * second implementation of the same rule, and the one more likely to drift.
 *
 * Never throws, for the same reason the broadcasts do not: this is called after
 * a security change that has already been committed, and failing to hang up
 * must not unwind it.
 */
export function disconnectUser(userId: string, reason: string): number {
  if (subscribers.size === 0) return 0;

  let closed = 0;
  try {
    // Collected first: closing mutates the set through the `close` handler.
    const doomed = [...subscribers].filter((subscriber) => subscriber.userId === userId);
    for (const subscriber of doomed) {
      subscriber.socket.close(REALTIME_CLOSE.FORBIDDEN, reason);
      closed += 1;
    }
    if (closed > 0) {
      logger.debug({ userId, closed, reason }, 'Closed realtime sockets for an account');
    }
  } catch (error) {
    logger.error({ err: error, userId }, 'Failed to close realtime sockets for an account');
  }
  return closed;
}

/**
 * The same, for several accounts at once — a role's permissions changing moves
 * every holder of it.
 */
export function disconnectUsers(userIds: string[], reason: string): number {
  if (userIds.length === 0) return 0;
  const targets = new Set(userIds);

  let closed = 0;
  try {
    const doomed = [...subscribers].filter(
      (subscriber) => subscriber.userId && targets.has(subscriber.userId),
    );
    for (const subscriber of doomed) {
      subscriber.socket.close(REALTIME_CLOSE.FORBIDDEN, reason);
      closed += 1;
    }
  } catch (error) {
    logger.error({ err: error, count: userIds.length }, 'Failed to close realtime sockets');
  }
  return closed;
}

/** Open sockets, for the health endpoint and for tests. */
export function realtimeConnectionCount(): number {
  return subscribers.size;
}

/** Open sockets belonging to no account, for the ceiling and for tests. */
export function realtimeAnonymousCount(): number {
  return anonymousCount;
}

/* ---------------------------------------------------------------- wiring */

export function attachRealtime(server: Server): void {
  if (wss) return;

  wss = new WebSocketServer({
    noServer: true,
    // Nothing legitimate is sent upstream but a pong.
    maxPayload: 4 * 1024,
    handleProtocols: () => REALTIME_SUBPROTOCOL,
  });

  server.on('upgrade', (req, socket, head) => {
    void handleUpgrade(req, socket, head).catch((error) => {
      logger.error({ err: error }, 'Realtime upgrade failed');
      socket.destroy();
    });
  });

  /**
   * An application-level heartbeat rather than protocol pings: a browser
   * answers a ping frame down in the network layer, where no page can observe
   * it. A ping/pong both ends can see is what lets either notice a connection
   * that has silently stopped carrying data, which is the usual fate of an idle
   * socket behind a proxy.
   */
  heartbeat = setInterval(() => {
    const at = new Date().toISOString();
    for (const subscriber of subscribers) {
      if (subscriber.missedBeats >= HEARTBEAT_GRACE) {
        subscriber.socket.terminate();
        continue;
      }
      subscriber.missedBeats += 1;
      send(subscriber, { type: 'ping', at });
    }
  }, HEARTBEAT_INTERVAL_MS);
  heartbeat.unref();

  logger.info({ path: REALTIME_PATH }, 'Realtime hub attached');
}

/** Closes every socket so a deploy does not leave clients waiting on a dead peer. */
export function closeRealtime(): void {
  if (heartbeat) {
    clearInterval(heartbeat);
    heartbeat = null;
  }
  for (const subscriber of subscribers) {
    if (subscriber.expiryTimer) clearTimeout(subscriber.expiryTimer);
    subscriber.socket.close(REALTIME_CLOSE.GOING_AWAY, 'Server shutting down');
  }
  subscribers.clear();
  anonymousCount = 0;
  wss?.close();
  wss = null;
}
