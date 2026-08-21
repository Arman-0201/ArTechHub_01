'use client';

import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import type { FeatureFlagDto } from '@academy/types';
import { PERMISSIONS } from '@academy/types';
import { api, useApiList, useApiMutation } from '@/lib/api/hooks';
import { cn } from '@/lib/utils';
import { useAuth } from '@/components/providers';
import { Alert, Card } from '@/components/ui';
import { AdminPageHeader } from './primitives';

/**
 * Feature flags.
 *
 * Turning a feature off does three things at once, and the copy says so
 * explicitly: navigation links disappear, the public routes stop resolving, and
 * the API refuses the corresponding requests. The last of those is the actual
 * control — the first two are consequences.
 */
export function FeaturesClient() {
  const { can } = useAuth();
  const canManage = can(PERMISSIONS.FEATURES_MANAGE);

  const [error, setError] = useState<string | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  const flagsQuery = useApiList<FeatureFlagDto>('/admin/features');

  const mutation = useApiMutation(
    ({ key, isEnabled }: { key: string; isEnabled: boolean }) =>
      api.put(`/admin/features/${key}`, { isEnabled }),
    ['/admin/features'],
    {
      onSettled: () => setPendingKey(null),
      onError: (caught) => setError(caught.message),
    },
  );

  return (
    <>
      <AdminPageHeader
        title="Features"
        description="Switch parts of the platform on or off without a deployment."
      />

      {error ? (
        <Alert tone="danger" className="mb-4">
          {error}
        </Alert>
      ) : null}

      <Alert tone="info" className="mb-5">
        <div className="flex gap-2">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            Disabling a feature removes its navigation links, makes its public routes return 404,
            and causes the API to refuse the matching requests. Hiding the link alone would not be
            a control.
          </span>
        </div>
      </Alert>

      <div className="max-w-3xl space-y-3">
        {flagsQuery.isLoading
          ? Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="skeleton h-20 rounded-xl" />
            ))
          : flagsQuery.data?.items.map((flag) => (
              <Card key={flag.key}>
                <div className="flex items-center justify-between gap-4 p-5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-medium text-text-primary">{flag.label}</h2>
                      <span className="rounded bg-surface-sunken px-1.5 py-0.5 font-mono text-2xs text-text-muted">
                        {flag.key}
                      </span>
                    </div>
                    {flag.description ? (
                      <p className="mt-1 text-sm text-text-secondary">{flag.description}</p>
                    ) : null}
                  </div>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={flag.isEnabled}
                    aria-label={`${flag.label}: ${flag.isEnabled ? 'enabled' : 'disabled'}`}
                    disabled={!canManage || pendingKey === flag.key}
                    onClick={() => {
                      setError(null);
                      setPendingKey(flag.key);
                      mutation.mutate({ key: flag.key, isEnabled: !flag.isEnabled });
                    }}
                    className={cn(
                      'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors',
                      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus',
                      'disabled:cursor-not-allowed disabled:opacity-50',
                      flag.isEnabled ? 'bg-primary' : 'bg-border-strong',
                    )}
                  >
                    <span
                      className={cn(
                        'inline-block size-4 rounded-full bg-white shadow-subtle transition-transform',
                        flag.isEnabled ? 'translate-x-6' : 'translate-x-1',
                      )}
                      aria-hidden="true"
                    />
                  </button>
                </div>
              </Card>
            ))}
      </div>
    </>
  );
}
