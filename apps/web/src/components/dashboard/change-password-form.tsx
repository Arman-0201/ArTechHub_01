'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { changePasswordSchema } from '@academy/validation';
import type { z } from 'zod';
import { Lock } from 'lucide-react';
import { api, setAccessToken } from '@/lib/api/client';
import { ApiError } from '@/lib/api/types';
import { applyServerFieldErrors } from '@/lib/forms';
import { localePath } from '@/lib/i18n/config';
import { Alert, Button, Card, Input } from '@/components/ui';

type ChangePasswordValues = z.infer<typeof changePasswordSchema>;

/**
 * Password change.
 *
 * The server revokes every session on success — including this one — so the
 * form signs the user out locally and redirects to the login screen rather than
 * leaving the page in a state where every request would 401.
 */
export function ChangePasswordForm({ locale }: { locale: string }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  async function onSubmit(values: ChangePasswordValues) {
    setFormError(null);
    try {
      await api.post('/auth/change-password', values);
      setDone(true);
      setAccessToken(null);
      setTimeout(() => {
        router.push(localePath(locale, '/login'));
        router.refresh();
      }, 2000);
    } catch (error) {
      if (error instanceof ApiError && error.fields) {
        applyServerFieldErrors(error.fields, setError, [
          'currentPassword',
          'newPassword',
          'confirmPassword',
        ]);
        return;
      }
      setFormError(
        error instanceof ApiError ? error.message : 'Could not change your password. Try again.',
      );
    }
  }

  return (
    <Card>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 p-6" noValidate>
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-text-primary">Password</h2>
          <p className="text-sm text-text-muted">
            Changing your password signs you out everywhere, including here.
          </p>
        </div>

        {done ? (
          <Alert tone="success" title="Password updated">
            Signing you out — please sign in again with your new password.
          </Alert>
        ) : (
          <>
            {formError ? <Alert tone="danger">{formError}</Alert> : null}

            <Input
              label="Current password"
              type="password"
              required
              autoComplete="current-password"
              leadingIcon={<Lock className="size-4" />}
              error={errors.currentPassword?.message}
              {...register('currentPassword')}
            />

            <div className="grid gap-5 sm:grid-cols-2">
              <Input
                label="New password"
                type="password"
                required
                autoComplete="new-password"
                error={errors.newPassword?.message}
                {...register('newPassword')}
              />
              <Input
                label="Confirm new password"
                type="password"
                required
                autoComplete="new-password"
                error={errors.confirmPassword?.message}
                {...register('confirmPassword')}
              />
            </div>

            <div className="flex justify-end border-t border-border pt-5">
              <Button type="submit" isLoading={isSubmitting}>
                Update password
              </Button>
            </div>
          </>
        )}
      </form>
    </Card>
  );
}
