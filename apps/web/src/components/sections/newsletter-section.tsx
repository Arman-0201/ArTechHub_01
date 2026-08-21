'use client';

import { useState } from 'react';
import { Mail } from 'lucide-react';
import { api } from '@/lib/api/client';
import { Button, Input } from '@/components/ui';
import { readOptionalString, readString, type SectionProps } from './types';

/**
 * Newsletter capture.
 *
 * The endpoint answers the same way whether the address is new or already
 * subscribed, so the form cannot be used to test whether someone is on the
 * list.
 */
export function NewsletterSection({ section }: SectionProps) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'submitting' | 'done' | 'error'>('idle');

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setState('submitting');
    try {
      await api.post('/newsletter/subscribe', { email });
      setState('done');
      setEmail('');
    } catch {
      setState('error');
    }
  }

  return (
    <section className="py-14 sm:py-20">
      <div className="container-page">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-5 rounded-2xl border border-border bg-surface p-8 text-center sm:p-12">
          <span
            className="grid size-12 place-items-center rounded-xl bg-primary-soft text-primary"
            aria-hidden="true"
          >
            <Mail className="size-5" />
          </span>

          <div className="space-y-2">
            <h2 className="text-2xl font-semibold text-text-primary">
              {readString(section.content, 'title', 'Stay in the loop')}
            </h2>
            {readOptionalString(section.content, 'description') ? (
              <p className="text-text-secondary">{readString(section.content, 'description')}</p>
            ) : null}
          </div>

          {state === 'done' ? (
            <p role="status" className="font-medium text-success">
              Thanks — check your inbox to confirm.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="flex w-full max-w-md items-start gap-2">
              <Input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                aria-label="Email address"
                containerClassName="flex-1"
                error={state === 'error' ? 'Could not subscribe. Please try again.' : undefined}
              />
              <Button type="submit" isLoading={state === 'submitting'}>
                {readString(section.content, 'buttonLabel', 'Subscribe')}
              </Button>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
