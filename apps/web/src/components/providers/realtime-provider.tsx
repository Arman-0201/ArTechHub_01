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
  type RealtimeResource,
  type RealtimeStatus,
} from '@academy/types';
import { connectRealtime } from '@/lib/realtime/client';

/**
 * Live admin data.
 *
 * The admin panel is a set of screens people leave open while other people
 * change the same records. Without this, a course list is only as fresh as the
 * last navigation, and two editors working at once quietly overwrite each
 * other. With it, an edit anywhere reaches every open panel in about as long as
 * the request itself took.
 *
 * The socket never carries the changed record — only which resources moved.
 * Each screen then refetches through the endpoint it always used, so nothing
 * arrives that the viewer was not already entitled to read, and a screen with
 * no live feed behaves exactly as it did before.
 */

/**
 * Which cached queries a changed resource invalidates.
 *
 * Matched as key *prefixes*, the same way `useApiMutation` invalidates after a
 * write, so `/admin/courses` covers `/admin/courses/{id}` and its analytics
 * without listing them.
 */
const QUERY_PREFIXES: Record<RealtimeResource, string[]> = {
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
  // `router.refresh()` below is what updates it.
  [REALTIME_RESOURCES.OVERVIEW]: [],
};

/**
 * Several admin screens render on the server, so keeping them current means
 * asking Next for a fresh render rather than invalidating a cache. That is a
 * whole-route round trip, so it is rate-limited: a burst of changes — a bulk
 * import, someone reordering twenty sections — should cost one re-render, not
 * twenty.
 */
const ROUTE_REFRESH_INTERVAL_MS = 2_000;

interface RealtimeContextValue {
  status: RealtimeStatus;
  /** The most recent change this client was told about, for status displays. */
  lastEvent: RealtimeChangeEvent | null;
  /** Changes received since the panel was opened. */
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
  /** False for a viewer the feed would refuse anyway — never open the socket. */
  enabled?: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [status, setStatus] = useState<RealtimeStatus>(enabled ? 'connecting' : 'disabled');
  const [lastEvent, setLastEvent] = useState<RealtimeChangeEvent | null>(null);
  const [eventCount, setEventCount] = useState(0);

  const lastRefreshRef = useRef(0);
  const refreshTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      setStatus('disabled');
      return;
    }

    const scheduleRouteRefresh = () => {
      if (document.visibilityState === 'hidden') return;
      if (refreshTimerRef.current !== null) return;

      const elapsed = Date.now() - lastRefreshRef.current;
      const wait = Math.max(0, ROUTE_REFRESH_INTERVAL_MS - elapsed);

      refreshTimerRef.current = window.setTimeout(() => {
        refreshTimerRef.current = null;
        lastRefreshRef.current = Date.now();
        router.refresh();
      }, wait);
    };

    const disconnect = connectRealtime({
      onStatus: setStatus,
      onEvent: (event) => {
        if (event.type !== 'resource.changed') return;

        setLastEvent(event);
        setEventCount((count) => count + 1);

        const prefixes = event.resources.flatMap((resource) => QUERY_PREFIXES[resource] ?? []);

        for (const prefix of prefixes) {
          void queryClient.invalidateQueries({
            predicate: (query) => String(query.queryKey[0] ?? '').startsWith(prefix),
          });
        }

        scheduleRouteRefresh();
      },
    });

    return () => {
      disconnect();
      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [enabled, queryClient, router]);

  const value = useMemo<RealtimeContextValue>(
    () => ({ status, lastEvent, eventCount }),
    [status, lastEvent, eventCount],
  );

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

/**
 * Reading this is always safe. Outside a `RealtimeProvider` it reports a feed
 * that is switched off, which is what a screen with no live connection should
 * render anyway.
 */
export function useRealtime(): RealtimeContextValue {
  return useContext(RealtimeContext);
}
