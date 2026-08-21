import Link from 'next/link';
import { Compass, Home, Search } from 'lucide-react';

/**
 * Locale-scoped 404.
 *
 * Reached both by a genuinely missing URL and by content the API declined to
 * serve (an unpublished page, a disabled feature) — which is deliberate: a
 * disabled section should be indistinguishable from one that never existed.
 */
export default function NotFound() {
  return (
    <div className="grid min-h-[60vh] place-items-center px-6 py-16">
      <div className="max-w-md space-y-6 text-center">
        <span
          className="mx-auto grid size-16 place-items-center rounded-2xl bg-primary-soft text-primary"
          aria-hidden="true"
        >
          <Compass className="size-7" />
        </span>

        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-text-primary">
            Page not found
          </h1>
          <p className="text-text-secondary">
            The page you are looking for does not exist, has moved, or is not currently available.
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-3">
          <Link
            href="/"
            className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-text-on-primary transition-colors hover:bg-primary-hover"
          >
            <Home className="size-4" aria-hidden="true" />
            Go home
          </Link>
          <Link
            href="/"
            className="inline-flex h-11 items-center gap-2 rounded-lg border border-border px-5 text-sm font-semibold text-text-secondary transition-colors hover:border-primary hover:text-primary"
          >
            <Search className="size-4" aria-hidden="true" />
            Browse courses
          </Link>
        </div>
      </div>
    </div>
  );
}
