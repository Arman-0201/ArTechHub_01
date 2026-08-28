'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import type { CollectionCategoryDto, CollectionEntryCardDto, CollectionTone } from '@academy/types';
import { cn } from '@/lib/utils';
import { localePath } from '@/lib/i18n/config';
import { Badge, EmptyState } from '@/components/ui';

/**
 * A collection's entries, searchable in the browser.
 *
 * The search filters what is already on the page rather than asking the server,
 * which is the whole reason the index endpoint returns its entries whole. That
 * buys three things a round trip cannot: results while typing rather than after
 * a pause, a filter that composes with the category chips without a second
 * query, and a component that works identically when dropped into a CMS page by
 * `CollectionGridSection`.
 *
 * It is bounded by the same fact that makes a reference collection a collection
 * at all — a few hundred short entries, capped server-side. A catalogue that
 * outgrows that wants the paginated course listing, not this.
 */

export type CollectionTitleLevel = 'h2' | 'h3';

const TONE_BADGE = {
  DEFAULT: 'neutral',
  INFO: 'primary',
  SUCCESS: 'success',
  WARNING: 'warning',
  DANGER: 'danger',
} as const satisfies Record<CollectionTone, string>;

/** The card border, so a dangerous entry reads as one before the badge is read. */
const TONE_BORDER: Record<CollectionTone, string> = {
  DEFAULT: 'border-border hover:border-primary',
  INFO: 'border-border hover:border-primary',
  SUCCESS: 'border-border hover:border-success',
  WARNING: 'border-warning/40 hover:border-warning',
  DANGER: 'border-danger/40 hover:border-danger',
};

/**
 * Everything a visitor might type to find an entry, lowercased once.
 *
 * Built per entry and memoised across keystrokes: matching is the work that
 * happens on every character, so it must not also be string-building.
 */
function haystack(entry: CollectionEntryCardDto): string {
  return [
    entry.title,
    entry.subtitle,
    entry.summary,
    entry.badge,
    entry.category?.name,
    ...entry.keywords,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export function CollectionGrid({
  locale,
  collectionSlug,
  entries,
  categories,
  searchPlaceholder,
  showSearch = true,
  columns = 3,
  titleLevel = 'h3',
  emptyMessage = 'Nothing here yet.',
}: {
  locale: string;
  collectionSlug: string;
  entries: CollectionEntryCardDto[];
  categories: CollectionCategoryDto[];
  searchPlaceholder?: string | null;
  showSearch?: boolean;
  columns?: number;
  /**
   * Which heading a card title is. An index page's own `<h1>` is above this, so
   * cards are `h3` under the grid's `h2`; a section dropped mid-page supplies
   * its own heading and passes `h3` for the same reason.
   */
  titleLevel?: CollectionTitleLevel;
  emptyMessage?: string;
}) {
  const [term, setTerm] = useState('');
  const [categorySlug, setCategorySlug] = useState<string | null>(null);

  // Typing stays responsive on a large collection: the input updates on every
  // keystroke, the list re-filters at React's convenience.
  const deferredTerm = useDeferredValue(term);

  const indexed = useMemo(
    () => entries.map((entry) => ({ entry, text: haystack(entry) })),
    [entries],
  );

  const visible = useMemo(() => {
    const needle = deferredTerm.trim().toLowerCase();

    return indexed
      .filter(({ entry, text }) => {
        if (categorySlug && entry.category?.slug !== categorySlug) return false;
        if (!needle) return true;
        // Every word must appear somewhere, so "ssh remote" narrows rather than
        // widens — the behaviour a search box is expected to have.
        return needle.split(/\s+/).every((word) => text.includes(word));
      })
      .map(({ entry }) => entry);
  }, [indexed, deferredTerm, categorySlug]);

  const Title = titleLevel;
  const hasFilters = categories.length > 0;

  return (
    <div className="space-y-6">
      {showSearch ? (
        <div className="relative mx-auto max-w-xl">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-text-muted"
            aria-hidden="true"
          />
          <input
            type="search"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder={searchPlaceholder ?? 'Search…'}
            aria-label={searchPlaceholder ?? 'Search this collection'}
            className={cn(
              'h-11 w-full rounded-lg border border-border bg-surface pl-10 pr-4 text-sm',
              'text-text-primary placeholder:text-text-muted',
              'focus:border-primary focus:outline-2 focus:outline-offset-2 focus:outline-border-focus',
            )}
          />
        </div>
      ) : null}

      {hasFilters ? (
        <div className="flex flex-wrap justify-center gap-2" role="group" aria-label="Filter">
          <FilterChip
            label={`All (${entries.length})`}
            isActive={categorySlug === null}
            onSelect={() => setCategorySlug(null)}
          />
          {categories.map((category) => (
            <FilterChip
              key={category.id}
              label={`${category.name} (${category.entryCount})`}
              isActive={categorySlug === category.slug}
              onSelect={() =>
                setCategorySlug((current) => (current === category.slug ? null : category.slug))
              }
            />
          ))}
        </div>
      ) : null}

      {visible.length === 0 ? (
        <EmptyState
          icon={<Search className="size-7" />}
          title="No matches"
          description={term.trim() ? `Nothing matches “${term.trim()}”.` : emptyMessage}
        />
      ) : (
        <ul
          className={cn(
            'grid gap-4',
            columns === 2
              ? 'sm:grid-cols-2'
              : columns === 4
                ? 'sm:grid-cols-2 lg:grid-cols-4'
                : 'sm:grid-cols-2 lg:grid-cols-3',
          )}
        >
          {visible.map((entry) => (
            <li key={entry.id}>
              <Link
                href={localePath(locale, `/reference/${collectionSlug}/${entry.slug}`)}
                className={cn(
                  'flex h-full flex-col rounded-xl border bg-surface p-5 transition-[border-color,transform]',
                  'duration-200 hover:-translate-y-0.5',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus',
                  TONE_BORDER[entry.tone],
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Title className="truncate text-base font-semibold text-text-primary">
                      {entry.title}
                    </Title>
                    {entry.subtitle ? (
                      <p className="mt-0.5 truncate text-sm text-text-secondary">
                        {entry.subtitle}
                      </p>
                    ) : null}
                  </div>
                  {entry.badge ? (
                    <Badge tone="primary" className="shrink-0">
                      {entry.badge}
                    </Badge>
                  ) : null}
                </div>

                {entry.summary ? (
                  <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-text-secondary">
                    {entry.summary}
                  </p>
                ) : null}

                {entry.category || entry.tone !== 'DEFAULT' ? (
                  <div className="mt-4 flex flex-wrap items-center gap-1.5">
                    {entry.category ? <Badge>{entry.category.name}</Badge> : null}
                    {entry.tone !== 'DEFAULT' ? (
                      <Badge tone={TONE_BADGE[entry.tone]}>
                        {entry.tone === 'DANGER' ? 'Dangerous' : entry.tone.toLowerCase()}
                      </Badge>
                    ) : null}
                  </div>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FilterChip({
  label,
  isActive,
  onSelect,
}: {
  label: string;
  isActive: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={isActive}
      onClick={onSelect}
      className={cn(
        'rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus',
        isActive
          ? 'border-transparent bg-primary text-text-on-primary'
          : 'border-border bg-surface text-text-secondary hover:border-primary hover:text-primary',
      )}
    >
      {label}
    </button>
  );
}
