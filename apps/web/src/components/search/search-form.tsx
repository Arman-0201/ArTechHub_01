'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { localePath } from '@/lib/i18n/config';
import { Button } from '@/components/ui';

/**
 * Search box on the results page.
 *
 * A real form with a submit button, so pressing Enter works and the query ends
 * up in the URL — which is what makes a result set linkable.
 */
export function SearchForm({
  initialQuery,
  locale,
}: {
  initialQuery: string;
  locale: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initialQuery);

  return (
    <form
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        const term = value.trim();
        if (term.length < 2) return;
        router.push(localePath(locale, `/search?q=${encodeURIComponent(term)}`));
      }}
      className="flex gap-2"
    >
      <div className="relative flex-1">
        <Search
          className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-text-muted"
          aria-hidden="true"
        />
        <input
          type="search"
          name="q"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Search courses, tracks and articles…"
          aria-label="Search"
          autoFocus
          className="h-12 w-full rounded-lg border border-border bg-surface pl-10 pr-4 text-base text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>
      <Button type="submit" size="lg">
        Search
      </Button>
    </form>
  );
}
