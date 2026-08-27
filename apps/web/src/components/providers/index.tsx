'use client';

import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { SessionUserDto, SiteBootstrapDto } from '@academy/types';
import type { Dictionary } from '@/lib/i18n/dictionaries';
import { ApiError } from '@/lib/api/types';
import { SiteProvider } from './site-provider';
import { AuthProvider } from './auth-provider';
import { RealtimeProvider } from './realtime-provider';
import { ThemeScript, ThemeProvider } from './theme-provider';

/**
 * Client provider stack, mounted once in the locale layout.
 *
 * Everything above this line is a Server Component: pages fetch their own data
 * on the server, and TanStack Query is used only where the client genuinely
 * owns the data (mutations, progress updates, admin tables with live filters).
 *
 * `RealtimeProvider` sits innermost because it reads the session — the socket's
 * audience is fixed at the handshake, so signing in has to rebuild it — and
 * needs the query client above it to invalidate what a change touched. One
 * socket per tab serves the whole site from here: a marketing page, the
 * dashboard and the admin panel are all inside it.
 */
export function Providers({
  locale,
  bootstrap,
  messages,
  initialUser,
  children,
}: {
  locale: string;
  bootstrap: SiteBootstrapDto;
  messages: Dictionary;
  initialUser: SessionUserDto | null;
  children: ReactNode;
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            gcTime: 5 * 60_000,
            refetchOnWindowFocus: false,
            retry(failureCount, error) {
              // Retrying an authorisation or validation failure just repeats
              // the same failure; only transient errors are worth a second try.
              if (error instanceof ApiError) {
                if (error.status < 500 && error.status !== 429) return false;
              }
              return failureCount < 2;
            },
          },
          mutations: { retry: false },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <SiteProvider locale={locale} bootstrap={bootstrap} messages={messages}>
          <AuthProvider locale={locale} initialUser={initialUser}>
            <RealtimeProvider>{children}</RealtimeProvider>
          </AuthProvider>
        </SiteProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export { ThemeScript };
export { RealtimeProvider, useRealtime } from './realtime-provider';
export { useSite, useTranslate, useLocaleHref } from './site-provider';
export { useAuth } from './auth-provider';
export { useTheme } from './theme-provider';
