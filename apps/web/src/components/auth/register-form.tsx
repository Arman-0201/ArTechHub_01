'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { registerSchema } from '@academy/validation';
import type { z } from 'zod';
import type { AuthResultDto } from '@academy/types';
import { Check, Eye, EyeOff, Lock, Mail, User } from 'lucide-react';
import { api, setAccessToken } from '@/lib/api/client';
import { ApiError } from '@/lib/api/types';
import { applyServerFieldErrors } from '@/lib/forms';
import { safeRedirectPath, cn } from '@/lib/utils';
import { localePath } from '@/lib/i18n/config';
import { useAuth, useSite } from '@/components/providers';
import { Alert, Button, Checkbox, Input } from '@/components/ui';
import { OAuthButtons } from './oauth-buttons';

type RegisterValues = z.infer<typeof registerSchema>;

/** Mirrors the server's password policy so the two never disagree. */
const PASSWORD_RULES = [
  { label: 'At least 10 characters', test: (value: string) => value.length >= 10 },
  { label: 'A lowercase letter', test: (value: string) => /[a-z]/.test(value) },
  { label: 'An uppercase letter', test: (value: string) => /[A-Z]/.test(value) },
  { label: 'A number', test: (value: string) => /[0-9]/.test(value) },
];

export function RegisterForm({ locale, redirectTo }: { locale: string; redirectTo?: string }) {
  const router = useRouter();
  const { refresh } = useAuth();
  const { t, bootstrap } = useSite();

  const [formError, setFormError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    // Validate as the user corrects a field, not on every keystroke from the
    // start — errors that appear before you finish typing are noise.
    mode: 'onTouched',
    defaultValues: {
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
      locale,
      acceptedTerms: false as unknown as true,
      acceptedPrivacy: false as unknown as true,
      marketingOptIn: false,
    },
  });

  const password = watch('password') ?? '';
  const passwordChecks = useMemo(
    () => PASSWORD_RULES.map((rule) => ({ ...rule, passed: rule.test(password) })),
    [password],
  );

  const destination = safeRedirectPath(redirectTo, '/dashboard');

  const legalLink = (slug: string, label: string) => {
    const known = bootstrap.legalLinks.find((entry) => entry.slug === slug);
    return (
      <Link
        href={localePath(locale, `/legal/${known?.slug ?? slug}`)}
        target="_blank"
        className="font-medium text-primary hover:underline"
      >
        {known?.title ?? label}
      </Link>
    );
  };

  async function onSubmit(values: RegisterValues) {
    setFormError(null);
    try {
      const result = await api.post<AuthResultDto>('/auth/register', values);
      // Registration returns a live session, so the new account lands signed in
      // rather than being bounced to the login form.
      setAccessToken(result.accessToken, result.accessTokenExpiresAt);
      await refresh();
      router.push(localePath(locale, destination));
      router.refresh();
    } catch (error) {
      if (error instanceof ApiError && error.fields) {
        applyServerFieldErrors(error.fields, setError, [
          'name',
          'email',
          'password',
          'confirmPassword',
          'acceptedTerms',
          'acceptedPrivacy',
        ]);
        if (!error.fields.email) setFormError(error.message);
        return;
      }
      setFormError(
        error instanceof ApiError ? error.message : 'Could not create your account. Please try again.',
      );
    }
  }

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
          Create your account
        </h1>
        <p className="text-text-secondary">Free to start. Your progress is saved from day one.</p>
      </header>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
        {formError ? <Alert tone="danger">{formError}</Alert> : null}

        <Input
          label={t('auth.nameLabel')}
          required
          autoComplete="name"
          autoFocus
          leadingIcon={<User className="size-4" />}
          error={errors.name?.message}
          {...register('name')}
        />

        <Input
          label={t('auth.emailLabel')}
          type="email"
          required
          autoComplete="email"
          leadingIcon={<Mail className="size-4" />}
          error={errors.email?.message}
          {...register('email')}
        />

        <div className="space-y-2">
          <div className="relative">
            <Input
              label={t('auth.passwordLabel')}
              type={showPassword ? 'text' : 'password'}
              required
              autoComplete="new-password"
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

          {password.length > 0 ? (
            <ul className="grid gap-1.5 sm:grid-cols-2" aria-label="Password requirements">
              {passwordChecks.map((rule) => (
                <li
                  key={rule.label}
                  className={cn(
                    'flex items-center gap-1.5 text-xs',
                    rule.passed ? 'text-success' : 'text-text-muted',
                  )}
                >
                  <Check
                    className={cn('size-3.5 shrink-0', !rule.passed && 'opacity-30')}
                    aria-hidden="true"
                  />
                  {rule.label}
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <Input
          label={t('auth.confirmPasswordLabel')}
          type={showPassword ? 'text' : 'password'}
          required
          autoComplete="new-password"
          leadingIcon={<Lock className="size-4" />}
          error={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />

        <div className="space-y-2.5 rounded-lg border border-border bg-surface-sunken p-4">
          <Checkbox
            label={<>I agree to the {legalLink('terms-of-service', 'Terms of Service')}</>}
            error={errors.acceptedTerms?.message}
            {...register('acceptedTerms')}
          />
          <Checkbox
            label={<>I agree to the {legalLink('privacy-policy', 'Privacy Policy')}</>}
            error={errors.acceptedPrivacy?.message}
            {...register('acceptedPrivacy')}
          />
          <Checkbox label={t('auth.marketingOptIn')} {...register('marketingOptIn')} />
        </div>

        <Button type="submit" isLoading={isSubmitting} size="lg" fullWidth>
          {t('action.register')}
        </Button>
      </form>

      <OAuthButtons redirectTo={destination} />

      <p className="text-center text-sm text-text-secondary">
        {t('auth.hasAccount')}{' '}
        <Link
          href={localePath(locale, '/login')}
          className="font-medium text-primary hover:underline"
        >
          {t('action.signIn')}
        </Link>
      </p>
    </div>
  );
}
