import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer } from 'ws';
import {
  REALTIME_BEARER_PREFIX,
  REALTIME_CLOSE,
  REALTIME_PATH,
  REALTIME_RESOURCE_PERMISSION,
  REALTIME_SUBPROTOCOL,
  type RealtimeChangeEvent,
  type RealtimeResource,
  type RealtimeServerEvent,
} from '@academy/types';
import { env } from '../config/env.js';
import { logger, logSecurityEvent } from '../lib/logger.js';
import { resolvePrincipalFromAccessToken } from '../middleware/authenticate.js';
import { verifyAccessToken } from '../lib/jwt.js';
import type { AuthenticatedUser } from '../types/express.js';

/**
 * Admin real-time hub.
 *
 * One WebSocket per signed-in administrator, carrying change notices so open
 * admin screens reflect what other people are doing without polling.
 *
 * Three things this deliberately is not:
 *
 *   - *A data channel.* Events name what changed; the client refetches through
 *     the ordinary authorised endpoint. A socket can therefore never become a
 *     second read path that skips a permission check.
 *   - *A command channel.* The only message the server accepts from a client is
 *     `pong`. Every write still goes through the HTTP API, with its validation,
 *     rate limits and audit trail intact.
 *   - *Shared across instances.* The registry below is in-process, so with more
 *     than one API instance a change made on instance A does not reach an admin
 *     connected to instance B, and those screens fall back to their normal
 *     refetch. Scaling out means publishing `broadcastChange` over Redis
 *     pub/sub; the call sites do not change. See docs/architecture.md.
 */

/** Sockets one account may hold open at once: a few tabs, not a leak. */
const MAX_SOCKETS_PER_USER = 6;

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
  userId: string;
  isSuperAdmin: boolean;
  permissions: Set<string>;
  /** Heartbeats sent since the last answer. Reset by every pong. */
  missedBeats: number;
  expiryTimer: NodeJS.Timeout;
}

const subscribers = new Set<Subscriber>();

let wss: WebSocketServer | null = null;
let heartbeat: NodeJS.Timeout | null = null;

/* ------------------------------------------------------------- handshake */

/**
 * The bearer arrives as a subprotocol token because a browser WebSocket cannot
 * set request headers. Only `REALTIME_SUBPROTOCOL` is echoed back, so the
 * credential is never reflected to the client or to anything logging the
 * response.
 */
function extractBearer(req: IncomingMessage): string | null {
  const header = req.headers['sec-websocket-protocol'];
  if (!header) return null;

  const offered = (Array.isArray(header) ? header.join(',') : header)
    .split(',')
    .map((entry) => entry.trim());

  if (!offered.includes(REALTIME_SUBPROTOCOL)) return null;

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

  const token = extractBearer(req);
  if (!token) {
    reject(socket, 401, 'Unauthorized');
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

  if (!user || !expiresAt || user.status === 'SUSPENDED' || user.status === 'INACTIVE') {
    reject(socket, 401, 'Unauthorized');
    return;
  }

  // The same bar as `/admin`: any admin permission opens the panel, and the
  // panel is the only thing this socket serves.
  if (!user.isSuperAdmin && user.permissions.size === 0) {
    reject(socket, 403, 'Forbidden');
    return;
  }

  if (countSocketsFor(user.id) >= MAX_SOCKETS_PER_USER) {
    reject(socket, 429, 'Too Many Requests');
    return;
  }

  const principal = user;
  const sessionExpiresAt = expiresAt;
  wss?.handleUpgrade(req, socket, head, (ws) => {
    register(ws, principal, sessionExpiresAt);
  });
}

/* ------------------------------------------------------------ membership */

function resourcesVisibleTo(subscriber: Subscriber): RealtimeResource[] {
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

function register(socket: WebSocket, user: AuthenticatedUser, expiresAt: Date): void {
  const subscriber: Subscriber = {
    socket,
    userId: user.id,
    isSuperAdmin: user.isSuperAdmin,
    permissions: new Set<string>(user.permissions),
    missedBeats: 0,
    /**
     * The socket authenticates once, at the handshake, and is never
     * re-authenticated. It therefore must not outlive the token it presented,
     * or revoking someone's access would leave their live feed running until
     * they closed the tab. Closing at expiry hands the decision back to the
     * client, which refreshes and reconnects if it still may.
     */
    expiryTimer: setTimeout(
      () => socket.close(REALTIME_CLOSE.TOKEN_EXPIRED, 'Access token expired'),
      Math.max(1_000, expiresAt.getTime() - Date.now()),
    ),
  };

  subscribers.add(subscriber);

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
    clearTimeout(subscriber.expiryTimer);
    subscribers.delete(subscriber);
  };
  socket.on('close', cleanup);
  socket.on('error', (error) => {
    logger.debug({ err: error, userId: subscriber.userId }, 'Realtime socket error');
    cleanup();
  });

  send(subscriber, {
    type: 'ready',
    resources: resourcesVisibleTo(subscriber),
    sessionExpiresAt: expiresAt.toISOString(),
    serverTime: new Date().toISOString(),
  });

  logger.debug({ userId: user.id, sockets: subscribers.size }, 'Realtime subscriber connected');
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

/** Open sockets, for the health endpoint and for tests. */
export function realtimeConnectionCount(): number {
  return subscribers.size;
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
    clearTimeout(subscriber.expiryTimer);
    subscriber.socket.close(REALTIME_CLOSE.GOING_AWAY, 'Server shutting down');
  }
  subscribers.clear();
  wss?.close();
  wss = null;
}
