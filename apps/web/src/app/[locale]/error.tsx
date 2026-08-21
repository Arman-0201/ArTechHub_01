'use client';

import { useEffect } from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';

/**
 * Locale-scoped error boundary.
 *
 * Shows a recoverable message rather than a blank page. The error's `digest` is
 * the only technical detail surfaced: it correlates with the server log entry
 * without exposing a stack trace to the visitor.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // In a real deployment this is where an error reporter would be called.
    console.error('Page error:', error);
  }, [error]);

  return (
    <div className="grid min-h-[60vh] place-items-center px-6 py-16">
      <div className="max-w-md space-y-6 text-center">
        <span
          className="mx-auto grid size-16 place-items-center rounded-2xl bg-danger-soft text-danger"
          aria-hidden="true"
        >
          <AlertTriangle className="size-7" />
        </span>

        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
            Something went wrong
          </h1>
          <p className="text-text-secondary">
            This page could not be loaded. The problem has been recorded — trying again often
            resolves it.
          </p>
          {error.digest ? (
            <p className="font-mono text-xs text-text-muted">Reference: {error.digest}</p>
          ) : null}
        </div>

        <button
          type="button"
          onClick={reset}
          className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-text-on-primary transition-colors hover:bg-primary-hover"
        >
          <RotateCw className="size-4" aria-hidden="true" />
          Try again
        </button>
      </div>
    </div>
  );
}
