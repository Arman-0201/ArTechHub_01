'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { useRealtime } from '@/components/providers';

/**
 * Whether the panel is live, and what moved last.
 *
 * Worth the space because the alternative is invisible: a reader cannot tell a
 * screen that is up to date from one whose connection died twenty minutes ago,
 * and the difference matters when two people are editing the same course. When
 * the feed is down this says so plainly rather than pretending — the data is
 * still correct as of the last load, just not live.
 */

const STATUS_COPY = {
  open: { label: 'Live', tone: 'bg-success', hint: 'Changes from other admins appear here as they happen.' },
  connecting: { label: 'Connecting…', tone: 'bg-warning', hint: 'Reconnecting to the live feed.' },
  offline: { label: 'Offline', tone: 'bg-text-muted', hint: 'Not receiving live updates. This screen refreshes when you navigate.' },
  disabled: { label: 'Not live', tone: 'bg-text-muted', hint: 'Live updates are unavailable for this session.' },
} as const;

export function RealtimeIndicator({ className }: { className?: string }) {
  const { status, lastEvent, eventCount } = useRealtime();
  const copy = STATUS_COPY[status];

  return (
    <div
      className={cn('px-3 py-2', className)}
      // The whole block is one status message: announcing the dot and the text
      // separately would read as two unrelated updates.
      role="status"
      aria-live="polite"
      title={copy.hint}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'size-1.5 shrink-0 rounded-full',
            copy.tone,
            status === 'open' && 'animate-pulse',
          )}
          aria-hidden="true"
        />
        <span className="text-2xs font-semibold uppercase tracking-wider text-text-muted">
          {copy.label}
        </span>
        {eventCount > 0 ? (
          <span className="ml-auto text-2xs tabular-nums text-text-muted">
            {eventCount} {eventCount === 1 ? 'change' : 'changes'}
          </span>
        ) : null}
      </div>

      {lastEvent ? (
        <p className="mt-1 truncate text-2xs text-text-muted">
          {describeAction(lastEvent.action)}
          {lastEvent.actor.name ? ` by ${lastEvent.actor.name}` : ''} ·{' '}
          <RelativeTime at={lastEvent.at} />
        </p>
      ) : null}
    </div>
  );
}

/** `course.status_changed` reads as "Course status changed". */
function describeAction(action: string): string {
  const words = action.replace(/[._]/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * "just now", then minutes.
 *
 * Rendered client-side only and ticked on a timer: a timestamp formatted during
 * a server render would hydrate as stale, and this label exists precisely to
 * say how stale things are.
 */
function RelativeTime({ at }: { at: string }) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [at]);

  if (now === null) return <span>just now</span>;

  const seconds = Math.max(0, Math.round((now - new Date(at).getTime()) / 1000));
  if (seconds < 45) return <span>just now</span>;

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return <span>{minutes}m ago</span>;
  return <span>{Math.round(minutes / 60)}h ago</span>;
}
