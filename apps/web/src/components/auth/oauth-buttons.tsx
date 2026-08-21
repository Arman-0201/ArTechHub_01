'use client';

import { useEffect, useState } from 'react';
import { Github } from 'lucide-react';
import { api } from '@/lib/api/client';

/**
 * OAuth provider buttons.
 *
 * The available providers come from the API, which only reports the ones that
 * are both configured (credentials present) and enabled by feature flag — so a
 * half-configured provider is never offered.
 *
 * These are plain links, not fetches: the browser must navigate to the
 * provider, and the whole code exchange happens server-side afterwards.
 */

const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/+$/, '');

interface Provider {
  id: 'google' | 'github';
  label: string;
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.06 12.25c0-.85-.08-1.67-.22-2.45H12v4.64h6.2a5.3 5.3 0 0 1-2.3 3.48v2.89h3.72c2.18-2 3.44-4.96 3.44-8.56Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.11 0 5.72-1.03 7.62-2.79l-3.72-2.89c-1.03.69-2.35 1.1-3.9 1.1-3 0-5.54-2.03-6.45-4.75H1.7v2.98A11.5 11.5 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.55 14.67a6.9 6.9 0 0 1 0-4.42V7.27H1.7a11.51 11.51 0 0 0 0 10.38l3.85-2.98Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.69 0 3.2.58 4.4 1.72l3.3-3.3C17.72 1.2 15.11 0 12 0 7.48 0 3.57 2.6 1.7 6.38l3.85 2.98C6.46 6.78 9 4.75 12 4.75Z"
      />
    </svg>
  );
}

export function OAuthButtons({ redirectTo = '/dashboard' }: { redirectTo?: string }) {
  const [providers, setProviders] = useState<Provider[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ providers: Provider[] }>('/auth/oauth/providers')
      .then((data) => {
        if (!cancelled) setProviders(data.providers);
      })
      .catch(() => {
        if (!cancelled) setProviders([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Nothing configured, or still loading: render nothing rather than a row of
  // placeholder buttons that may never appear.
  if (!providers || providers.length === 0) return null;

  // The redirect is a site-relative path; the API validates it again before
  // using it, so a tampered value cannot become an open redirect.
  const safeRedirect = redirectTo.startsWith('/') && !redirectTo.startsWith('//')
    ? redirectTo
    : '/dashboard';

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs font-medium uppercase tracking-wider text-text-muted">
          Or continue with
        </span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2">
        {providers.map((provider) => (
          <a
            key={provider.id}
            href={`${API_BASE}/api/v1/auth/oauth/${provider.id}/start?redirect=${encodeURIComponent(safeRedirect)}`}
            className="inline-flex h-11 items-center justify-center gap-2.5 rounded-lg border border-border bg-surface text-sm font-medium text-text-primary transition-colors hover:border-primary hover:bg-surface-sunken"
          >
            {provider.id === 'google' ? (
              <GoogleMark />
            ) : (
              <Github className="size-4" aria-hidden="true" />
            )}
            {provider.label}
          </a>
        ))}
      </div>
    </div>
  );
}
