'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import {
  REALTIME_RESOURCES,
  type RealtimeChangeEvent,
  type RealtimeLearnerTopic,
  type RealtimePublicChannel,
  type RealtimeResource,
  type RealtimeStatus,
} from '@academy/types';
import { connectRealtime } from '@/lib/realtime/client';
import { useAuth } from './auth-provider';

/**
 * Live data, everywhere.
 *
 * Mounted once for the whole site rather than once for the admin panel, so a
 * course published by an editor reaches the catalogue a visitor is reading, a
 * payment reaching PAID updates the buyer's order page, and completing a lesson
 * in one tab moves the dashboard in another — all without a reload and without
 * any page knowing a socket exists.
 *
 * The socket never carries the changed record, only which area moved. Each
 * screen then re-reads through the endpoint it always used, so nothing arrives
 * that the viewer was not already entitled to see, and a visitor whose feed is
 * unavailable gets exactly the site as it behaved before this existed.
 *
 * Most of this app renders on the server, so "refresh" usually means asking
 * Next for a new render rather than invalidating a cache. That is a whole-route
 * round trip, which is why the scheduling below is more careful than it looks.
 */

/**
 * Which cached queries a changed admin resource invalidates.
 *
 * Matched as key *prefixes*, the same way `useApiMutation` invalidates after a
 * write, so `/admin/courses` covers `/admin/courses/{id}` and its analytics
 * without listing them.
 */
const ADMIN_QUERY_PREFIXES: Record<RealtimeResource, string[]> = {
  [REALTIME_RESOURCES.USERS]: ['/admin/users'],
  // Changing a role changes what its holders can do, which the user list shows.
  [REALTIME_RESOURCES.ROLES]: ['/admin/roles', '/admin/users'],
  [REALTIME_RESOURCES.COURSES]: ['/admin/courses'],
  [REALTIME_RESOURCES.CATEGORIES]: ['/admin/categories'],
  [REALTIME_RESOURCES.INSTRUCTORS]: ['/admin/instructors'],
  [REALTIME_RESOURCES.ENROLLMENTS]: ['/admin/enrollments'],
  [REALTIME_RESOURCES.PAGES]: ['/admin/pages'],
  [REALTIME_RESOURCES.MENUS]: ['/admin/menus', '/admin/footer'],
  [REALTIME_RESOURCES.MEDIA]: ['/admin/media'],
  [REALTIME_RESOURCES.BLOG]: ['/admin/blog'],
  [REALTIME_RESOURCES.LEGAL]: ['/admin/legal'],
  [REALTIME_RESOURCES.PRODUCTS]: ['/admin/products'],
  [REALTIME_RESOURCES.ORDERS]: ['/admin/orders'],
  [REALTIME_RESOURCES.LANGUAGES]: ['/admin/languages', '/admin/translations'],
  [REALTIME_RESOURCES.SETTINGS]: ['/admin/settings'],
  [REALTIME_RESOURCES.FEATURES]: ['/admin/features'],
  [REALTIME_RESOURCES.AUDIT]: ['/admin/audit-logs'],
  // The dashboard is a Server Component with no client cache to invalidate;
  // the route refresh below is what updates it.
  [REALTIME_RESOURCES.OVERVIEW]: [],
};

/**
 * A learner's own data, where a client cache holds it.
 *
 * Short, because the learner-facing screens are server-rendered — the route
 * refresh does the work. These cover the few places that read through the
 * query client.
 */
const LEARNER_QUERY_PREFIXES: Record<RealtimeLearnerTopic, string[]> = {
  enrollments: ['/account/enrollments', '/account/dashboard'],
  progress: ['/account/progress', '/account/dashboard'],
  orders: ['/account/orders'],
  profile: ['/account/profile'],
};

/**
 * How long to wait before re-rendering the route, by what moved.
 *
 * The differences are about who is waiting. A learner just did something and is
 * looking at the result, so the delay is only long enough to coalesce a burst.
 * An admin is watching someone else work, and two seconds of staleness is
 * invisible. A public visitor is not waiting at all — the page they are reading
 * is still correct — so that one is late *and* spread out.
 */
const REFRESH_DELAY_MS = { learner: 400, admin: 2_000, public: 3_000 } as const;

/**
 * Extra, random delay on a public refresh.
 *
 * A single publish reaches every connected visitor at once. Without this they
 * would all ask for a fresh render of their page in the same instant, turning
 * one editorial click into a synchronised burst of server rendering — the
 * failure mode that makes live updates worse than none. Spreading them over a
 * few seconds costs nobody anything: no one is watching for this change.
 */
const PUBLIC_REFRESH_JITTER_MS = 7_000;

interface RealtimeContextValue {
  status: RealtimeStatus;
  /** The most recent admin change this client was told about, for status displays. */
  lastEvent: RealtimeChangeEvent | null;
  /** Changes of any kind received since the page was opened. */
  eventCount: number;
}

const RealtimeContext = createContext<RealtimeContextValue>({
  status: 'disabled',
  lastEvent: null,
  eventCount: 0,
});

export function RealtimeProvider({
  enabled = true,
  children,
}: {
  /** False switches the feed off entirely — no socket is opened. */
  enabled?: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [status, setStatus] = useState<RealtimeStatus>(enabled ? 'connecting' : 'disabled');
  const [lastEvent, setLastEvent] = useState<RealtimeChangeEvent | null>(null);
  const [eventCount, setEventCount] = useState(0);

  const lastRefreshRef = useRef(0);
  const refreshTimerRef = useRef<number | null>(null);

  /**
   * The session, as a value the effect can depend on without reconnecting for
   * every unrelated change to the user object. Signing in or out has to rebuild
   * the socket — its audience was fixed at the handshake — but a renamed
   * profile must not.
   */
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!enabled) {
      setStatus('disabled');
      return;
    }

    /**
     * One pending refresh at a time, at the shortest delay anything has asked
     * for.
     *
     * A single edit commonly produces two events — the public channel and the
     * admin resource — and a burst of edits produces many. All of them want the
     * same thing: this route, rendered once, soon. Whoever is most impatient
     * sets the timing.
     */
    const scheduleRouteRefresh = (delayMs: number) => {
      // A hidden tab is not being read, and refreshing it would spend a render
      // nobody sees. The client reconnects and the next event lands when the
      // tab comes back.
      if (document.visibilityState === 'hidden') return;

      const elapsed = Date.now() - lastRefreshRef.current;
      const wait = Math.max(0, delayMs - elapsed);

      if (refreshTimerRef.current !== null) {
        // Something is already scheduled. Only reschedule if this is more
        // urgent than what is pending, which the elapsed-time floor makes
        // comparable across calls.
        if (wait >= REFRESH_DELAY_MS.learner) return;
        window.clearTimeout(refreshTimerRef.current);
      }

      refreshTimerRef.current = window.setTimeout(() => {
        refreshTimerRef.current = null;
        lastRefreshRef.current = Date.now();
        router.refresh();
      }, wait);
    };

    const invalidate = (prefixes: string[]) => {
      for (const prefix of prefixes) {
        void queryClient.invalidateQueries({
          predicate: (query) => String(query.queryKey[0] ?? '').startsWith(prefix),
        });
      }
    };

    const disconnect = connectRealtime({
      authenticated: Boolean(userId),
      onStatus: setStatus,
      onEvent: (event) => {
        switch (event.type) {
          case 'public.changed': {
            setEventCount((count) => count + 1);
            invalidate(publicPrefixesFor(event.channels));
            scheduleRouteRefresh(
              REFRESH_DELAY_MS.public + Math.random() * PUBLIC_REFRESH_JITTER_MS,
            );
            return;
          }

          case 'learner.changed': {
            setEventCount((count) => count + 1);
            invalidate(event.topics.flatMap((topic) => LEARNER_QUERY_PREFIXES[topic] ?? []));
            scheduleRouteRefresh(REFRESH_DELAY_MS.learner);
            return;
          }

          case 'resource.changed': {
            setLastEvent(event);
            setEventCount((count) => count + 1);
            invalidate(event.resources.flatMap((resource) => ADMIN_QUERY_PREFIXES[resource] ?? []));
            scheduleRouteRefresh(REFRESH_DELAY_MS.admin);
            return;
          }

          default:
            // `ready`, and anything a newer server sends that this build does
            // not know about. Ignored rather than guessed at.
            return;
        }
      },
    });

    return () => {
      disconnect();
      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [enabled, queryClient, router, userId]);

  const value = useMemo<RealtimeContextValue>(
    () => ({ status, lastEvent, eventCount }),
    [status, lastEvent, eventCount],
  );

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

/**
 * Public channels invalidate almost nothing in the client cache: the public
 * pages are server-rendered, so the route refresh is what updates them. The one
 * exception is the shop, where the cart re-prices itself through the API.
 */
function publicPrefixesFor(channels: RealtimePublicChannel[]): string[] {
  return channels.includes('commerce') ? ['/shop', '/cart'] : [];
}

/**
 * Reading this is always safe. Outside a `RealtimeProvider` it reports a feed
 * that is switched off, which is what a screen with no live connection should
 * render anyway.
 */
export function useRealtime(): RealtimeContextValue {
  return useContext(RealtimeContext);
}
