'use client';

import { useEffect, useState } from 'react';
import { Monitor, Trash2 } from 'lucide-react';
import { api } from '@/lib/api/client';
import { formatRelativeDate } from '@/lib/utils';
import { Button, Card, Skeleton } from '@/components/ui';

interface SessionRow {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  expiresAt: string;
}

/** Best-effort, readable summary of a user-agent string. */
function describeDevice(userAgent: string | null): string {
  if (!userAgent) return 'Unknown device';

  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /Chrome\//.test(userAgent)
      ? 'Chrome'
      : /Safari\//.test(userAgent)
        ? 'Safari'
        : /Firefox\//.test(userAgent)
          ? 'Firefox'
          : 'Browser';

  const platform = /Windows/.test(userAgent)
    ? 'Windows'
    : /Macintosh|Mac OS/.test(userAgent)
      ? 'macOS'
      : /Android/.test(userAgent)
        ? 'Android'
        : /iPhone|iPad/.test(userAgent)
          ? 'iOS'
          : /Linux/.test(userAgent)
            ? 'Linux'
            : 'Unknown OS';

  return `${browser} on ${platform}`;
}

/**
 * Active sessions.
 *
 * Lets a user see and end sessions they do not recognise. The list contains no
 * token material — the API returns only metadata, deliberately.
 */
export function SessionsPanel() {
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<SessionRow[]>('/account/sessions')
      .then((data) => {
        if (!cancelled) setSessions(data);
      })
      .catch(() => {
        if (!cancelled) setSessions([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function revoke(id: string) {
    setRevokingId(id);
    try {
      await api.post('/account/sessions/revoke', { sessionId: id });
      setSessions((current) => current?.filter((session) => session.id !== id) ?? null);
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <Card>
      <div className="space-y-4 p-6">
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-text-primary">Active sessions</h2>
          <p className="text-sm text-text-muted">
            Devices currently signed in. End any you do not recognise.
          </p>
        </div>

        {sessions === null ? (
          <div className="space-y-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-text-muted">No other active sessions.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {sessions.map((session) => (
              <li key={session.id} className="flex items-center gap-3 p-3.5">
                <Monitor className="size-4 shrink-0 text-text-muted" aria-hidden="true" />

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-text-primary">
                    {describeDevice(session.userAgent)}
                  </p>
                  <p className="truncate text-xs text-text-muted">
                    {session.ipAddress ? `${session.ipAddress} · ` : ''}
                    started {formatRelativeDate(session.createdAt)}
                  </p>
                </div>

                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void revoke(session.id)}
                  isLoading={revokingId === session.id}
                  aria-label={`End session on ${describeDevice(session.userAgent)}`}
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
