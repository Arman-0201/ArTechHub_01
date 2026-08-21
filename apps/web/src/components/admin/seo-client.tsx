'use client';

import { useState } from 'react';
import { ExternalLink, Globe, Save } from 'lucide-react';
import { PERMISSIONS } from '@academy/types';
import { api, useApiMutation, useApiResource } from '@/lib/api/hooks';
import { cn } from '@/lib/utils';
import { useAuth } from '@/components/providers';
import { Alert, Button, Card } from '@/components/ui';
import { AdminPageHeader } from './primitives';
import { SeoFields, emptySeoForm, toSeoPayload, type SeoFormValue } from './seo-fields';

/**
 * SEO for hardcoded routes.
 *
 * Pages, courses, articles and products carry their own SEO record, edited
 * where that content is edited. What is left over is the handful of routes that
 * are code, not content — the catalogue index, search, the instructor
 * directory — and this screen is where those get their metadata.
 */
const ROUTES = [
  { key: 'courses', label: 'Course catalogue', path: '/courses' },
  { key: 'categories', label: 'Category index', path: '/categories' },
  { key: 'instructors', label: 'Instructor directory', path: '/instructors' },
  { key: 'blog', label: 'Article index', path: '/blog' },
  { key: 'search', label: 'Search', path: '/search' },
  { key: 'shop', label: 'Shop', path: '/shop' },
];

interface SeoRecord {
  title: string | null;
  description: string | null;
  keywords: string[];
  canonicalUrl: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImageUrl: string | null;
  robots: string | null;
}

export function SeoClient({ locale }: { locale: string }) {
  const { can } = useAuth();
  const canManage = can(PERMISSIONS.SEO_MANAGE);

  const [routeKey, setRouteKey] = useState(ROUTES[0]!.key);
  const route = ROUTES.find((entry) => entry.key === routeKey)!;

  return (
    <>
      <AdminPageHeader
        title="SEO"
        description="Metadata for the built-in routes. Content pages carry their own SEO where they are edited."
      />

      <Alert tone="info" className="mb-5">
        <div className="flex gap-2">
          <Globe className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            Every public URL is emitted with a locale-aware canonical link and hreflang alternates
            for all eight locales, and appears in the generated sitemap automatically.
          </span>
        </div>
      </Alert>

      <div className="grid gap-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <nav aria-label="Routes">
          <ul className="space-y-0.5">
            {ROUTES.map((entry) => (
              <li key={entry.key}>
                <button
                  type="button"
                  onClick={() => setRouteKey(entry.key)}
                  aria-current={routeKey === entry.key ? 'page' : undefined}
                  className={cn(
                    'flex w-full flex-col rounded-lg px-3 py-2 text-left transition-colors',
                    routeKey === entry.key
                      ? 'bg-primary-soft text-primary'
                      : 'text-text-secondary hover:bg-surface-sunken hover:text-text-primary',
                  )}
                >
                  <span className="text-sm font-medium">{entry.label}</span>
                  <span className="font-mono text-2xs text-text-muted">{entry.path}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* Remounting on route change resets the form to the newly-loaded record. */}
        <RouteSeoEditor
          key={route.key}
          routeKey={route.key}
          label={route.label}
          path={route.path}
          locale={locale}
          canManage={canManage}
        />
      </div>
    </>
  );
}

function RouteSeoEditor({
  routeKey,
  label,
  path,
  locale,
  canManage,
}: {
  routeKey: string;
  label: string;
  path: string;
  locale: string;
  canManage: boolean;
}) {
  const existingQuery = useApiResource<SeoRecord | null>(`/site/seo/route/${routeKey}`);

  const [seo, setSeo] = useState<SeoFormValue | null>(null);
  const [status, setStatus] = useState<'idle' | 'saved'>('idle');
  const [error, setError] = useState<string | null>(null);

  // Hydrate once the stored record arrives; `seo === null` means "still loading".
  if (seo === null && !existingQuery.isLoading) {
    setSeo(emptySeoForm(existingQuery.data ?? null));
  }

  const mutation = useApiMutation(
    () => api.put('/admin/seo/route', { routeKey, seo: toSeoPayload(seo!) }),
    ['/site/seo/route'],
    { onSuccess: () => setStatus('saved'), onError: (caught) => setError(caught.message) },
  );

  if (!seo) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="skeleton h-40 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex items-center justify-between gap-3 p-4">
          <div className="min-w-0">
            <h2 className="font-semibold text-text-primary">{label}</h2>
            <p className="font-mono text-2xs text-text-muted">
              /{locale}
              {path}
            </p>
          </div>
          <Button variant="ghost" size="sm" href={`/${locale}${path}`}>
            <ExternalLink className="size-3.5" aria-hidden="true" />
            Visit
          </Button>
        </div>
      </Card>

      {status === 'saved' ? <Alert tone="success">Metadata saved.</Alert> : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <SeoFields value={seo} onChange={setSeo} previewTitle={label} previewPath={path} />

      {canManage ? (
        <div className="flex justify-end">
          <Button
            onClick={() => {
              setStatus('idle');
              setError(null);
              mutation.mutate(undefined as never);
            }}
            isLoading={mutation.isPending}
          >
            <Save className="size-4" aria-hidden="true" />
            Save metadata
          </Button>
        </div>
      ) : (
        <Alert tone="info">Your role can view this metadata but not change it.</Alert>
      )}
    </div>
  );
}
