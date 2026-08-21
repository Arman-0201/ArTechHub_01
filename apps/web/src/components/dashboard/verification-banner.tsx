'use client';

import { useState } from 'react';
import { MailWarning } from 'lucide-react';
import { api } from '@/lib/api/client';
import { Button } from '@/components/ui';

/**
 * Prompt shown until the account's email address is confirmed.
 *
 * Verification gates enrollment server-side, so this explains a real
 * restriction rather than nagging: without it the learner would hit a refusal
 * with no context when they try to enroll.
 */
export function VerificationBanner({ email }: { email: string }) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');

  async function resend() {
    setState('sending');
    try {
      await api.post('/auth/resend-verification', { email });
    } finally {
      // The endpoint deliberately does not confirm whether the address exists,
      // so the UI reports the same outcome either way.
      setState('sent');
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-warning/25 bg-warning-soft p-4 sm:flex-row sm:items-center">
      <MailWarning className="size-5 shrink-0 text-warning" aria-hidden="true" />

      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-text-primary">Verify your email address</p>
        <p className="text-sm text-text-secondary">
          {state === 'sent'
            ? 'A fresh verification link is on its way to your inbox.'
            : `Confirm ${email} to enroll in courses and save your progress.`}
        </p>
      </div>

      {state !== 'sent' ? (
        <Button size="sm" variant="outline" onClick={resend} isLoading={state === 'sending'}>
          Resend link
        </Button>
      ) : null}
    </div>
  );
}
