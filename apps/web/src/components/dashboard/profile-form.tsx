'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { updateProfileSchema } from '@academy/validation';
import type { z } from 'zod';
import type { UserDetailDto } from '@academy/types';
import { api } from '@/lib/api/client';
import { ApiError } from '@/lib/api/types';
import { applyServerFieldErrors } from '@/lib/forms';
import { colorFromString, initialsOf } from '@/lib/utils';
import { Alert, Button, Card, Input, Textarea } from '@/components/ui';
import { AvatarUploader } from './avatar-uploader';

type ProfileValues = z.infer<typeof updateProfileSchema>;

export function ProfileForm({ profile }: { profile: UserDetailDto }) {
  const router = useRouter();
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [formError, setFormError] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState(profile.avatarUrl);

  const {
    register,
    handleSubmit,
    setValue,
    setError,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ProfileValues>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: {
      name: profile.name,
      headline: profile.headline ?? '',
      bio: profile.bio ?? '',
    },
  });

  async function onSubmit(values: ProfileValues) {
    setFormError(null);
    setStatus('idle');
    try {
      await api.patch('/account/profile', values);
      setStatus('saved');
      // The header shows the name and avatar, so the server-rendered shell
      // needs to re-read them.
      router.refresh();
    } catch (error) {
      if (error instanceof ApiError && error.fields) {
        applyServerFieldErrors(error.fields, setError, ['name', 'headline', 'bio']);
        return;
      }
      setStatus('error');
      setFormError(
        error instanceof ApiError ? error.message : 'Could not save your profile. Try again.',
      );
    }
  }

  return (
    <Card>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 p-6" noValidate>
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-text-primary">Your details</h2>
          <p className="text-sm text-text-muted">
            Shown on your profile and alongside anything you author.
          </p>
        </div>

        {status === 'saved' ? <Alert tone="success">Profile updated.</Alert> : null}
        {formError ? <Alert tone="danger">{formError}</Alert> : null}

        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <div className="flex flex-col items-center gap-3">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt=""
                className="size-20 rounded-full object-cover"
                width={80}
                height={80}
              />
            ) : (
              <span
                className="grid size-20 place-items-center rounded-full text-xl font-semibold text-white"
                style={{ backgroundColor: colorFromString(profile.id) }}
                aria-hidden="true"
              >
                {initialsOf(profile.name)}
              </span>
            )}

            <AvatarUploader
              onUploaded={(media) => {
                setAvatarUrl(media.url);
                setValue('avatarMediaId', media.id, { shouldDirty: true });
              }}
            />
          </div>

          <div className="flex-1 space-y-5">
            <Input
              label="Full name"
              required
              autoComplete="name"
              error={errors.name?.message}
              {...register('name')}
            />

            <Input
              label="Headline"
              hint="A short line describing what you do. Optional."
              placeholder="Backend engineer, learning Kubernetes"
              error={errors.headline?.message}
              {...register('headline')}
            />

            <Textarea
              label="About you"
              rows={4}
              hint="Optional. Shown on your public instructor profile if you have one."
              error={errors.bio?.message}
              {...register('bio')}
            />
          </div>
        </div>

        <div className="flex justify-end border-t border-border pt-5">
          <Button type="submit" isLoading={isSubmitting} disabled={!isDirty}>
            Save changes
          </Button>
        </div>
      </form>
    </Card>
  );
}
