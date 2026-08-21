'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { contactMessageSchema } from '@academy/validation';
import type { z } from 'zod';
import { Send } from 'lucide-react';
import { api } from '@/lib/api/client';
import { ApiError } from '@/lib/api/types';
import { useState } from 'react';
import { Alert, Button, Card, Input, Textarea } from '@/components/ui';
import { applyServerFieldErrors } from '@/lib/forms';

type ContactValues = z.infer<typeof contactMessageSchema>;

/**
 * Contact form.
 *
 * Client-side validation shares the exact schema the API enforces, so the two
 * cannot drift. The client check is for feedback speed only — the server
 * validates independently and its field errors are mapped back onto the inputs.
 */
export function ContactForm() {
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ContactValues>({
    resolver: zodResolver(contactMessageSchema),
    defaultValues: { name: '', email: '', subject: '', message: '' },
  });

  async function onSubmit(values: ContactValues) {
    setFormError(null);
    try {
      await api.post('/contact', values);
      setSubmitted(true);
      reset();
    } catch (error) {
      if (error instanceof ApiError && error.fields) {
        applyServerFieldErrors(error.fields, setError);
        return;
      }
      setFormError(
        error instanceof ApiError ? error.message : 'Could not send your message. Please try again.',
      );
    }
  }

  if (submitted) {
    return (
      <Card className="mx-auto max-w-2xl">
        <div className="p-8 text-center">
          <Alert tone="success" title="Message sent">
            Thanks for reaching out — we reply to every message, usually within a day.
          </Alert>
          <Button variant="ghost" className="mt-4" onClick={() => setSubmitted(false)}>
            Send another message
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="mx-auto max-w-2xl">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 p-6 sm:p-8" noValidate>
        {formError ? <Alert tone="danger">{formError}</Alert> : null}

        <div className="grid gap-5 sm:grid-cols-2">
          <Input
            label="Your name"
            required
            autoComplete="name"
            error={errors.name?.message}
            {...register('name')}
          />
          <Input
            label="Email address"
            type="email"
            required
            autoComplete="email"
            error={errors.email?.message}
            {...register('email')}
          />
        </div>

        <Input
          label="Subject"
          required
          error={errors.subject?.message}
          {...register('subject')}
        />

        <Textarea
          label="Message"
          required
          rows={6}
          hint="Tell us what you need — the more context, the better the answer."
          error={errors.message?.message}
          {...register('message')}
        />

        <Button type="submit" isLoading={isSubmitting} size="lg">
          <Send className="size-4" aria-hidden="true" />
          Send message
        </Button>
      </form>
    </Card>
  );
}
