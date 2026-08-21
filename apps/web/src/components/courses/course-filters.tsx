'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Loader2, Search, SlidersHorizontal, X } from 'lucide-react';
import type { CategoryDto } from '@academy/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui';

const LEVELS = [
  { value: 'BEGINNER', label: 'Beginner' },
  { value: 'INTERMEDIATE', label: 'Intermediate' },
  { value: 'ADVANCED', label: 'Advanced' },
  { value: 'EXPERT', label: 'Expert' },
];

const SORTS = [
  { value: 'newest', label: 'Newest' },
  { value: 'popular', label: 'Most popular' },
  { value: 'title', label: 'Title A–Z' },
];

/**
 * Catalogue filters.
 *
 * Filter state lives in the URL, not in component state: the server does the
 * filtering, back/forward work, and a filtered view can be shared as a link.
 * `useTransition` keeps the current results visible while the new page loads
 * instead of flashing a spinner over everything.
 */
export function CourseFilters({
  categories,
  locale,
}: {
  categories: CategoryDto[];
  locale: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [searchValue, setSearchValue] = useState(searchParams.get('search') ?? '');
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const isFirstRender = useRef(true);

  const activeCategory = searchParams.get('category') ?? '';
  const activeLevel = searchParams.get('level') ?? '';
  const activeSort = searchParams.get('sort') ?? 'newest';
  const hasFilters = Boolean(activeCategory || activeLevel || searchParams.get('search'));

  function applyParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    // Any filter change invalidates the current page number.
    params.delete('page');

    const query = params.toString();
    startTransition(() => {
      router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
    });
  }

  // Debounce the search box so typing does not push a history entry per key.
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    const timer = setTimeout(() => {
      const current = searchParams.get('search') ?? '';
      if (searchValue.trim() === current) return;
      applyParam('search', searchValue.trim() || null);
    }, 400);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchValue]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-text-muted"
            aria-hidden="true"
          />
          <input
            type="search"
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
            placeholder="Search courses, topics or tags…"
            aria-label="Search courses"
            className="h-11 w-full rounded-lg border border-border bg-surface pl-10 pr-10 text-sm text-text-primary transition-[border-color,box-shadow] placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          {isPending ? (
            <Loader2
              className="absolute right-3.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-text-muted"
              aria-hidden="true"
            />
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsPanelOpen((previous) => !previous)}
            aria-expanded={isPanelOpen}
            className={cn(
              'inline-flex h-11 items-center gap-2 rounded-lg border px-4 text-sm font-medium transition-colors sm:hidden',
              hasFilters
                ? 'border-primary bg-primary-soft text-primary'
                : 'border-border text-text-secondary',
            )}
          >
            <SlidersHorizontal className="size-4" aria-hidden="true" />
            Filters
          </button>

          <label className="sr-only" htmlFor="course-sort">
            Sort by
          </label>
          <select
            id="course-sort"
            value={activeSort}
            onChange={(event) => applyParam('sort', event.target.value === 'newest' ? null : event.target.value)}
            className="h-11 rounded-lg border border-border bg-surface px-3 text-sm text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            {SORTS.map((sort) => (
              <option key={sort.value} value={sort.value}>
                {sort.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className={cn('space-y-4', !isPanelOpen && 'hidden sm:block')}>
        <FilterRow
          label="Track"
          options={categories.map((category) => ({
            value: category.slug,
            label: category.name,
          }))}
          active={activeCategory}
          onSelect={(value) => applyParam('category', value)}
        />

        <FilterRow
          label="Level"
          options={LEVELS}
          active={activeLevel}
          onSelect={(value) => applyParam('level', value)}
        />

        {hasFilters ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearchValue('');
              startTransition(() => router.push(pathname, { scroll: false }));
            }}
          >
            <X className="size-3.5" aria-hidden="true" />
            Clear filters
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function FilterRow({
  label,
  options,
  active,
  onSelect,
}: {
  label: string;
  options: { value: string; label: string }[];
  active: string;
  onSelect: (value: string | null) => void;
}) {
  if (options.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">
        {label}
      </span>
      <button
        type="button"
        onClick={() => onSelect(null)}
        aria-pressed={active === ''}
        className={cn(
          'rounded-full border px-3.5 py-1.5 text-sm transition-colors',
          active === ''
            ? 'border-primary bg-primary text-text-on-primary'
            : 'border-border text-text-secondary hover:border-primary hover:text-primary',
        )}
      >
        All
      </button>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onSelect(active === option.value ? null : option.value)}
          aria-pressed={active === option.value}
          className={cn(
            'rounded-full border px-3.5 py-1.5 text-sm transition-colors',
            active === option.value
              ? 'border-primary bg-primary text-text-on-primary'
              : 'border-border text-text-secondary hover:border-primary hover:text-primary',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
