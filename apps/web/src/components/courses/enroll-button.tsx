'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Lock, ShoppingCart } from 'lucide-react';
import { api } from '@/lib/api/client';
import { ApiError } from '@/lib/api/types';
import { localePath } from '@/lib/i18n/config';
import { useAuth } from '@/components/providers';
import { Alert, Button } from '@/components/ui';

/**
 * Enrollment action.
 *
 * Branches on access type and session state to show the right call to action,
 * but grants nothing itself: the server decides whether the enrollment is
 * allowed, including for paid and invite-only courses. Failures are surfaced
 * with the server's message rather than a generic one.
 */
export function EnrollButton({
  courseId,
  courseSlug,
  locale,
  isEnrolled,
  accessType,
  resumeLessonSlug,
  progressPercent,
}: {
  courseId: string;
  courseSlug: string;
  locale: string;
  isEnrolled: boolean;
  accessType: string;
  resumeLessonSlug: string | null;
  progressPercent: number;
}) {
  const router = useRouter();
  const { user, status } = useAuth();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const learnHref = resumeLessonSlug
    ? localePath(locale, `/learn/${courseSlug}/${resumeLessonSlug}`)
    : localePath(locale, `/courses/${courseSlug}`);

  if (isEnrolled) {
    return (
      <Button href={learnHref} fullWidth size="lg">
        {progressPercent > 0 ? 'Continue learning' : 'Start course'}
        <ArrowRight className="size-4" aria-hidden="true" />
      </Button>
    );
  }

  if (status === 'loading') {
    return <div className="h-12 w-full animate-pulse rounded-lg bg-surface-sunken" />;
  }

  if (!user) {
    return (
      <div className="space-y-2">
        <Button
          href={localePath(locale, `/login?redirect=/courses/${courseSlug}`)}
          fullWidth
          size="lg"
        >
          Sign in to enroll
        </Button>
        <p className="text-center text-xs text-text-muted">
          Creating an account is free and takes a minute.
        </p>
      </div>
    );
  }

  if (accessType === 'PAID') {
    return (
      <Button href={localePath(locale, '/shop')} fullWidth size="lg">
        <ShoppingCart className="size-4" aria-hidden="true" />
        Purchase this course
      </Button>
    );
  }

  if (accessType === 'INVITE_ONLY' || accessType === 'PRIVATE') {
    return (
      <div className="flex items-center justify-center gap-2 rounded-lg border border-border bg-surface-sunken px-4 py-3 text-sm text-text-secondary">
        <Lock className="size-4" aria-hidden="true" />
        Available by invitation
      </div>
    );
  }

  async function enroll() {
    setIsSubmitting(true);
    setError(null);
    try {
      await api.post('/account/enrollments', { courseId });
      // The course page is server-rendered, so refresh rather than mutating
      // local state — it re-reads viewer progress and the resume lesson too.
      router.refresh();
      if (resumeLessonSlug) router.push(learnHref);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'Could not enroll right now. Please try again.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-3">
      <Button onClick={enroll} isLoading={isSubmitting} fullWidth size="lg">
        Enroll for free
        <ArrowRight className="size-4" aria-hidden="true" />
      </Button>

      {error ? (
        <Alert tone="danger">
          {error}
          {!user.emailVerified ? (
            <p className="mt-1.5">
              Verify your email address from your profile, then try again.
            </p>
          ) : null}
        </Alert>
      ) : null}
    </div>
  );
}
