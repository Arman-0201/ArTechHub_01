'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import type { AuthResultDto, Permission, SessionUserDto } from '@academy/types';
import {
  api,
  onSessionChange,
  refreshSession,
  setAccessToken,
  setClientLocale,
} from '@/lib/api/client';

/**
 * Client-side session state.
 *
 * The access token itself never enters React state or storage — it lives in the
 * API client's module scope. What lives here is the *user*, which is safe to
 * render and carries no authority of its own: every permission check in this
 * provider is a UX decision, and the server re-checks all of them.
 */

interface AuthContextValue {
  user: SessionUserDto | null;
  status: 'loading' | 'authenticated' | 'unauthenticated';
  signIn: (email: string, password: string) => Promise<SessionUserDto>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  /** Presentation only. The API enforces the same check server-side. */
  can: (permission: Permission) => boolean;
  hasRole: (slug: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({
  locale,
  initialUser,
  children,
}: {
  locale: string;
  initialUser: SessionUserDto | null;
  children: ReactNode;
}) {
  const router = useRouter();
  const [user, setUser] = useState<SessionUserDto | null>(initialUser);
  const [status, setStatus] = useState<AuthContextValue['status']>(
    initialUser ? 'authenticated' : 'loading',
  );
  const hasBootstrapped = useRef(false);

  useEffect(() => {
    setClientLocale(locale);
  }, [locale]);

  /**
   * On mount the client has no access token even when the server rendered a
   * signed-in page — the token lives in memory and the server render happened
   * elsewhere. One silent refresh exchanges the HttpOnly cookie for a token.
   */
  useEffect(() => {
    if (hasBootstrapped.current) return;
    hasBootstrapped.current = true;

    let cancelled = false;

    void refreshSession().then((session) => {
      if (cancelled) return;
      if (session) {
        setUser(session.user);
        setStatus('authenticated');
      } else {
        setUser(null);
        setStatus('unauthenticated');
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  // The API client emits when a refresh succeeds or a request 401s, which keeps
  // this state correct even for sessions that end mid-page.
  useEffect(
    () =>
      onSessionChange((session) => {
        if (session) {
          setUser(session.user);
          setStatus('authenticated');
        } else {
          setUser(null);
          setStatus('unauthenticated');
        }
      }),
    [],
  );

  const signIn = useCallback(
    async (email: string, password: string) => {
      const result = await api.post<AuthResultDto>('/auth/login', { email, password });
      setAccessToken(result.accessToken, result.accessTokenExpiresAt);
      setUser(result.user);
      setStatus('authenticated');
      // Server components rendered for an anonymous visitor must be re-fetched.
      router.refresh();
      return result.user;
    },
    [router],
  );

  const signOut = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      setAccessToken(null);
      setUser(null);
      setStatus('unauthenticated');
      router.refresh();
    }
  }, [router]);

  const refresh = useCallback(async () => {
    const session = await refreshSession();
    setUser(session?.user ?? null);
    setStatus(session ? 'authenticated' : 'unauthenticated');
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      status,
      signIn,
      signOut,
      refresh,
      can: (permission) =>
        Boolean(user && (user.isSuperAdmin || user.permissions.includes(permission))),
      hasRole: (slug) => Boolean(user?.roles.some((role) => role.slug === slug)),
    }),
    [user, status, signIn, signOut, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside an AuthProvider');
  return context;
}
