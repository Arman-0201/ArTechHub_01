'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema } from '@academy/validation';
import type { z } from 'zod';
import { Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { ApiError } from '@/lib/api/types';
import { safeRedirectPath } from '@/lib/utils';
import { localePath } from '@/lib/i18n/config';
import { useAuth, useSite } from '@/components/providers';
import { Alert, Button, Checkbox, Input } from '@/components/ui';
import { OAuthButtons } from './oauth-buttons';

type LoginValues = z.infer<typeof loginSchema>;

export function LoginForm({
  locale,
  redirectTo,
  oauthError,
}: {
  locale: string;
  redirectTo?: string;
  oauthError?: string;
}) {
  const router = useRouter();
  const { signIn } = useAuth();
  const { t, isFeatureEnabled } = useSite();

  const [formError, setFormError] = useState<string | null>(
    oauthError === 'oauth_failed'
      ? 'That sign-in attempt could not be completed. Please try again.'
      : null,
  );
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '', rememberMe: true },
  });

  // Only site-relative targets are honoured, so `?redirect=` cannot send a
  // freshly-authenticated user to another origin.
  const destination = safeRedirectPath(redirectTo, '/dashboard');
  const hasExplicitRedirect = Boolean(redirectTo);

  async function onSubmit(values: LoginValues) {
    setFormError(null);
    try {
      const user = await signIn(values.email, values.password);

      // An explicit `?redirect=` always wins — it is where the user was headed.
      // Otherwise staff land in the admin panel: an admin-only account has no
      // enrolled courses, so the learner dashboard would greet them with an
      // empty page and no obvious way onward.
      const target = hasExplicitRedirect
        ? destination
        : user.canAccessAdmin
          ? '/admin'
          : '/dashboard';

      router.push(localePath(locale, target));
    } catch (error) {
      // The API answers identically for an unknown address and a wrong
      // password; this message preserves that.
      setFormError(
        error instanceof ApiError ? error.message : 'Could not sign in. Please try again.',
      );
    }
  }

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
          Welcome back
        </h1>
        <p className="text-text-secondary">Sign in to pick up where you left off.</p>
      </header>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
        {formError ? <Alert tone="danger">{formError}</Alert> : null}

        <Input
          label={t('auth.emailLabel')}
          type="email"
          required
          autoComplete="email"
          autoFocus
          leadingIcon={<Mail className="size-4" />}
          error={errors.email?.message}
          {...register('email')}
        />

        <div className="space-y-1.5">
          <div className="relative">
            <Input
              label={t('auth.passwordLabel')}
              type={showPassword ? 'text' : 'password'}
              required
              autoComplete="current-password"
              leadingIcon={<Lock className="size-4" />}
              error={errors.password?.message}
              className="pr-11"
              {...register('password')}
            />
            <button
              type="button"
              onClick={() => setShowPassword((previous) => !previous)}
              className="absolute right-3 top-[2.1rem] text-text-muted transition-colors hover:text-text-primary"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? (
                <EyeOff className="size-4" aria-hidden="true" />
              ) : (
                <Eye className="size-4" aria-hidden="true" />
              )}
            </button>
          </div>

          <div className="flex items-center justify-between">
            <Checkbox label={t('auth.rememberMe')} {...register('rememberMe')} />
            <Link
              href={localePath(locale, '/forgot-password')}
              className="text-sm font-medium text-primary hover:underline"
            >
              {t('auth.forgotPassword')}
            </Link>
          </div>
        </div>

        <Button type="submit" isLoading={isSubmitting} size="lg" fullWidth>
          {t('action.signIn')}
        </Button>
      </form>

      <OAuthButtons redirectTo={destination} />

      {isFeatureEnabled('REGISTRATION_ENABLED') ? (
        <p className="text-center text-sm text-text-secondary">
          {t('auth.noAccount')}{' '}
          <Link
            href={localePath(locale, '/register')}
            className="font-medium text-primary hover:underline"
          >
            {t('action.register')}
          </Link>
        </p>
      ) : null}
    </div>
  );
}
