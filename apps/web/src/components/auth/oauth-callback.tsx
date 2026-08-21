'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { refreshSession } from '@/lib/api/client';
import { safeRedirectPath } from '@/lib/utils';
import { localePath } from '@/lib/i18n/config';
import { Alert, Button } from '@/components/ui';

export function OAuthCallbackHandler({
  locale,
  redirectTo,
}: {
  locale: string;
  redirectTo?: string;
}) {
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  const hasRun = useRef(false);

  useEffect(() => {
    // Strict Mode double-invokes effects in development; refreshing twice would
    // rotate the token and invalidate the session we just created.
    if (hasRun.current) return;
    hasRun.current = true;

    let cancelled = false;

    void refreshSession().then((session) => {
      if (cancelled) return;
      if (!session) {
        setFailed(true);
        return;
      }
      router.replace(localePath(locale, safeRedirectPath(redirectTo, '/dashboard')));
      router.refresh();
    });

    return () => {
      cancelled = true;
    };
  }, [locale, redirectTo, router]);

  if (failed) {
    return (
      <div className="grid min-h-[60vh] place-items-center px-6">
        <div className="w-full max-w-md space-y-5">
          <Alert tone="danger" title="Sign-in could not be completed">
            The session could not be established. Please try signing in again.
          </Alert>
          <Button href={localePath(locale, '/login')} fullWidth>
            Back to sign in
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid min-h-[60vh] place-items-center px-6">
      <div className="flex flex-col items-center gap-4 text-center" role="status">
        <Loader2 className="size-8 animate-spin text-primary" aria-hidden="true" />
        <p className="text-text-secondary">Signing you in…</p>
      </div>
    </div>
  );
}
