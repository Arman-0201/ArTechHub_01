import {
  REALTIME_BEARER_PREFIX,
  REALTIME_CLOSE,
  REALTIME_PATH,
  REALTIME_SUBPROTOCOL,
  type RealtimeServerEvent,
  type RealtimeStatus,
} from '@academy/types';
import { getAccessToken, refreshSession } from '@/lib/api/client';

/**
 * Browser end of the live feed.
 *
 * A WebSocket is the one call the browser makes that does *not* go through this
 * app's own origin. The Next route handler that proxies `/api/v1/*` cannot
 * forward an HTTP upgrade — a route handler answers a request, it does not hand
 * over the socket — so this connects straight to the API and authenticates with
 * a bearer token rather than the first-party cookie every other call uses.
 *
 * A visitor with no session connects anyway, without a token, and is given the
 * public feed. That is deliberate: the larger half of "the site keeps itself
 * current" is the pages anyone can read, and a socket that carries only channel
 * names is worth nothing to whoever holds it.
 *
 * Everything else here is about surviving the ordinary: a laptop lid closing, a
 * tunnel, a deploy restarting the API, an access token expiring mid-session.
 * None of those should need a page reload, and none of them should produce a
 * reconnect storm.
 */

/** Backoff between reconnects: fast enough to feel instant, then patient. */
const RETRY_DELAYS_MS = [500, 1_000, 2_000, 5_000, 10_000, 30_000];

/**
 * How many times to try before concluding the feed is simply not available
 * here — but only while it has never once connected.
 *
 * A browser cannot see the status of a rejected upgrade: an operator who has
 * switched the public feed off, an instance at its connection ceiling and a
 * genuinely unreachable API all arrive as the same anonymous close. Retrying
 * any of them forever would have every visitor knocking every thirty seconds
 * for as long as their tab is open. Once a socket *has* opened, the cap no
 * longer applies — a drop after that is a network event, and those recover.
 *
 * Giving up is not final either: returning to the tab or regaining a network
 * connection re-arms it.
 */
const MAX_COLD_ATTEMPTS = 8;

export interface RealtimeConnectionOptions {
  onEvent: (event: RealtimeServerEvent) => void;
  onStatus: (status: RealtimeStatus) => void;
  /**
   * Whether this tab believes it has a session.
   *
   * It decides only one thing: whether an absent access token is worth a
   * refresh before connecting. For a signed-out visitor there is nothing to
   * refresh and the request would be a wasted round trip on every page; for a
   * signed-in one, skipping it would silently downgrade them to the public feed
   * and lose their own events.
   */
  authenticated: boolean;
}

function socketUrl(): string | null {
  const base = process.env.NEXT_PUBLIC_API_URL;
  if (!base) return null;
  try {
    const url = new URL(REALTIME_PATH, base);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Opens the feed and keeps it open until the returned function is called.
 *
 * Returns a teardown rather than an object with methods: there is nothing to
 * ask a live feed to do. It is either running or it is not.
 */
export function connectRealtime(options: RealtimeConnectionOptions): () => void {
  const resolved = socketUrl();

  if (!resolved || typeof WebSocket === 'undefined') {
    // No API origin configured, or a runtime without WebSocket. The panel keeps
    // working; it just refetches on its own schedule.
    options.onStatus('disabled');
    return () => undefined;
  }

  const url: string = resolved;

  let socket: WebSocket | null = null;
  let retryTimer: number | null = null;
  let attempt = 0;
  let stopped = false;
  /**
   * True from the moment a connection is asked for until the socket exists.
   * `socket` alone is not enough of a guard: the token refresh below is awaited,
   * and a `visibilitychange` landing in that window would see no socket yet and
   * open a second one.
   */
  let opening = false;
  /** Set by the first successful open, and never cleared. */
  let hasEverOpened = false;
  /** Failed attempts since the last success, or since the tab woke up. */
  let coldAttempts = 0;

  const clearRetry = () => {
    if (retryTimer !== null) {
      window.clearTimeout(retryTimer);
      retryTimer = null;
    }
  };

  const scheduleRetry = (immediate = false) => {
    if (stopped || retryTimer !== null) return;

    if (!hasEverOpened && coldAttempts >= MAX_COLD_ATTEMPTS) {
      options.onStatus('disabled');
      return;
    }

    const base = immediate ? 0 : (RETRY_DELAYS_MS[attempt] ?? RETRY_DELAYS_MS.at(-1) ?? 30_000);
    attempt = Math.min(attempt + 1, RETRY_DELAYS_MS.length - 1);

    // Jitter, so a restarted API is not met by every open admin tab at once.
    const delay = base + Math.random() * base * 0.3;
    retryTimer = window.setTimeout(() => {
      retryTimer = null;
      void open();
    }, delay);
  };

  async function open(): Promise<void> {
    if (stopped || socket || opening) return;
    opening = true;

    options.onStatus('connecting');

    // The token lives in the API client's memory and is short-lived. A refresh
    // here costs one request and removes the most common reason a socket is
    // refused, which would otherwise cost a full backoff cycle to discover.
    // Only worth it for a tab that believes it has a session — see
    // `authenticated`.
    let token = getAccessToken();
    if (!token && options.authenticated) {
      const session = await refreshSession();
      token = session?.accessToken ?? null;
    }
    if (stopped) {
      opening = false;
      return;
    }

    let next: WebSocket;
    try {
      // The credential rides as a subprotocol token because a browser
      // WebSocket cannot set headers, and a token in the URL would be written
      // to every access log between here and the API. Without one the socket
      // is opened anyway and the server grants it the public feed.
      const protocols = token
        ? [REALTIME_SUBPROTOCOL, `${REALTIME_BEARER_PREFIX}${token}`]
        : [REALTIME_SUBPROTOCOL];
      next = new WebSocket(url, protocols);
    } catch {
      opening = false;
      options.onStatus('offline');
      scheduleRetry();
      return;
    }

    socket = next;
    opening = false;

    next.onopen = () => {
      attempt = 0;
      coldAttempts = 0;
      hasEverOpened = true;
      options.onStatus('open');
    };

    next.onmessage = (message) => {
      let event: RealtimeServerEvent;
      try {
        event = JSON.parse(String(message.data)) as RealtimeServerEvent;
      } catch {
        return;
      }

      if (event.type === 'ping') {
        next.send(JSON.stringify({ type: 'pong' }));
        return;
      }

      options.onEvent(event);
    };

    next.onerror = () => {
      // `onclose` always follows, and it carries the code. Nothing to do here
      // beyond not letting the event reach the console as an unhandled error.
    };

    next.onclose = (event) => {
      socket = null;
      if (stopped) return;

      coldAttempts += 1;
      options.onStatus('offline');

      if (event.code === REALTIME_CLOSE.FORBIDDEN) {
        // This account may not use the feed. Reconnecting would only repeat the
        // refusal, so the panel falls back to ordinary refetching.
        options.onStatus('disabled');
        return;
      }

      // An expired token or a restarting server are both immediately
      // recoverable — the reconnect mints a fresh token on the way through.
      const recoverImmediately =
        event.code === REALTIME_CLOSE.TOKEN_EXPIRED || event.code === REALTIME_CLOSE.GOING_AWAY;

      if (recoverImmediately) attempt = 0;
      scheduleRetry(recoverImmediately);
    };
  }

  /**
   * A tab that has been in the background may have been silently disconnected
   * for hours. Coming back to the foreground, or back onto a network, is the
   * moment to find out rather than the moment the next backoff happens to fire.
   */
  const wakeUp = () => {
    if (stopped || socket || opening) return;
    if (document.visibilityState === 'hidden') return;
    clearRetry();
    attempt = 0;
    // Also re-arms a feed that gave up: whatever was refusing it may not be
    // refusing it now, and this is a deliberate signal that the tab is back.
    coldAttempts = 0;
    void open();
  };

  document.addEventListener('visibilitychange', wakeUp);
  window.addEventListener('online', wakeUp);

  void open();

  return () => {
    stopped = true;
    clearRetry();
    document.removeEventListener('visibilitychange', wakeUp);
    window.removeEventListener('online', wakeUp);
    // 1000 is a deliberate close, which stops the server from treating it as a
    // dropped connection.
    socket?.close(1000, 'Client left');
    socket = null;
  };
}
