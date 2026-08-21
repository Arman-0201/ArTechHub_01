'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { forgotPasswordSchema, resetPasswordSchema } from '@academy/validation';
import type { z } from 'zod';
import { ArrowLeft, CheckCircle2, Loader2, Lock, Mail, XCircle } from 'lucide-react';
import { api } from '@/lib/api/client';
import { ApiError } from '@/lib/api/types';
import { applyServerFieldErrors } from '@/lib/forms';
import { localePath } from '@/lib/i18n/config';
import { Alert, Button, Input } from '@/components/ui';

type ForgotValues = z.infer<typeof forgotPasswordSchema>;
type ResetValues = z.infer<typeof resetPasswordSchema>;

/**
 * Forgot-password request.
 *
 * The success screen is shown whether or not the address is registered — the
 * API answers identically in both cases, and revealing the difference here
 * would hand an attacker an account-enumeration oracle.
 */
export function ForgotPasswordForm({ locale }: { locale: string }) {
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<ForgotValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  async function onSubmit(values: ForgotValues) {
    setFormError(null);
    try {
      await api.post('/auth/forgot-password', values);
      setSubmitted(true);
    } catch (error) {
      setFormError(
        error instanceof ApiError ? error.message : 'Could not send the reset link. Try again.',
      );
    }
  }

  if (submitted) {
    return (
      <div className="space-y-6">
        <Alert tone="success" title="Check your inbox">
          If an account exists for <strong>{getValues('email')}</strong>, a password reset link is
          on its way. The link is valid for one hour.
        </Alert>
        <Link
          href={localePath(locale, '/login')}
          className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
          Reset your password
        </h1>
        <p className="text-text-secondary">
          Enter the email address on your account and we will send a reset link.
        </p>
      </header>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
        {formError ? <Alert tone="danger">{formError}</Alert> : null}

        <Input
          label="Email address"
          type="email"
          required
          autoFocus
          autoComplete="email"
          leadingIcon={<Mail className="size-4" />}
          error={errors.email?.message}
          {...register('email')}
        />

        <Button type="submit" isLoading={isSubmitting} size="lg" fullWidth>
          Send reset link
        </Button>
      </form>

      <Link
        href={localePath(locale, '/login')}
        className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to sign in
      </Link>
    </div>
  );
}

/**
 * Reset completion.
 *
 * Every existing session is revoked server-side when the password changes, so
 * the user is sent to sign in again with the new credential.
 */
export function ResetPasswordForm({ locale, token }: { locale: string; token: string }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ResetValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token, password: '', confirmPassword: '' },
  });

  async function onSubmit(values: ResetValues) {
    setFormError(null);
    try {
      await api.post('/auth/reset-password', values);
      setDone(true);
      setTimeout(() => router.push(localePath(locale, '/login')), 2500);
    } catch (error) {
      if (error instanceof ApiError && error.fields) {
        applyServerFieldErrors(error.fields, setError, ['password', 'confirmPassword', 'token']);
        if (error.fields.token) setFormError('This reset link is invalid or has expired.');
        return;
      }
      setFormError(
        error instanceof ApiError ? error.message : 'Could not reset your password. Try again.',
      );
    }
  }

  if (!token) {
    return (
      <div className="space-y-6">
        <Alert tone="danger" title="Missing reset token">
          This link is incomplete. Request a new password reset email.
        </Alert>
        <Button href={localePath(locale, '/forgot-password')} fullWidth>
          Request a new link
        </Button>
      </div>
    );
  }

  if (done) {
    return (
      <Alert tone="success" title="Password updated">
        You can now sign in with your new password. Redirecting…
      </Alert>
    );
  }

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
          Choose a new password
        </h1>
        <p className="text-text-secondary">
          Signing in elsewhere will end those sessions for security.
        </p>
      </header>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
        {formError ? <Alert tone="danger">{formError}</Alert> : null}
        <input type="hidden" {...register('token')} />

        <Input
          label="New password"
          type="password"
          required
          autoFocus
          autoComplete="new-password"
          hint="At least 10 characters, with upper and lower case letters and a number."
          leadingIcon={<Lock className="size-4" />}
          error={errors.password?.message}
          {...register('password')}
        />

        <Input
          label="Confirm new password"
          type="password"
          required
          autoComplete="new-password"
          leadingIcon={<Lock className="size-4" />}
          error={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />

        <Button type="submit" isLoading={isSubmitting} size="lg" fullWidth>
          Update password
        </Button>
      </form>
    </div>
  );
}

/**
 * Email verification.
 *
 * Runs the exchange on mount because the user arrived by clicking a link — an
 * extra "confirm" button would add a step without adding safety, since the
 * token is single-use and short-lived.
 */
export function VerifyAccountView({ locale, token }: { locale: string; token: string | undefined }) {
  const [state, setState] = useState<'idle' | 'verifying' | 'success' | 'error'>(
    token ? 'verifying' : 'idle',
  );
  const [message, setMessage] = useState<string | null>(null);
  const [resendEmail, setResendEmail] = useState('');
  const [resent, setResent] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    api
      .post('/auth/verify-email', { token })
      .then(() => {
        if (!cancelled) setState('success');
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState('error');
        setMessage(
          error instanceof ApiError
            ? error.message
            : 'This verification link is invalid or has expired.',
        );
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  async function resend(event: React.FormEvent) {
    event.preventDefault();
    try {
      await api.post('/auth/resend-verification', { email: resendEmail });
    } finally {
      // Always report success: the endpoint does not disclose whether the
      // address exists, and neither should this screen.
      setResent(true);
    }
  }

  if (state === 'verifying') {
    return (
      <div className="flex flex-col items-center gap-4 py-12 text-center">
        <Loader2 className="size-8 animate-spin text-primary" aria-hidden="true" />
        <p className="text-text-secondary">Verifying your email address…</p>
      </div>
    );
  }

  if (state === 'success') {
    return (
      <div className="space-y-6 text-center">
        <CheckCircle2 className="mx-auto size-12 text-success" aria-hidden="true" />
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-text-primary">Email verified</h1>
          <p className="text-text-secondary">
            Your account is active. You can now enroll in courses and track your progress.
          </p>
        </div>
        <Button href={localePath(locale, '/dashboard')} size="lg" fullWidth>
          Go to your dashboard
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {state === 'error' ? (
        <div className="space-y-3 text-center">
          <XCircle className="mx-auto size-12 text-danger" aria-hidden="true" />
          <h1 className="text-2xl font-semibold text-text-primary">Verification failed</h1>
          <p className="text-text-secondary">{message}</p>
        </div>
      ) : (
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold text-text-primary">Verify your email</h1>
          <p className="text-text-secondary">
            Enter your address and we will send a fresh verification link.
          </p>
        </header>
      )}

      {resent ? (
        <Alert tone="success">
          If that address needs verification, a new link is on its way.
        </Alert>
      ) : (
        <form onSubmit={resend} className="space-y-4">
          <Input
            label="Email address"
            type="email"
            required
            value={resendEmail}
            onChange={(event) => setResendEmail(event.target.value)}
            leadingIcon={<Mail className="size-4" />}
          />
          <Button type="submit" fullWidth>
            Send a new link
          </Button>
        </form>
      )}

      <Link
        href={localePath(locale, '/login')}
        className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to sign in
      </Link>
    </div>
  );
}
