import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { PaginationMeta } from '@academy/types';
import { cn } from '@/lib/utils';

/**
 * Server-rendered pagination.
 *
 * Real links rather than buttons, so pages are crawlable, shareable and work
 * with middle-click. The page window is capped at five entries with ellipses,
 * which keeps a 200-page result set from producing 200 tab stops.
 */

function buildHref(
  basePath: string,
  searchParams: Record<string, string | undefined>,
  page: number,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (key === 'page' || value === undefined || value === '') continue;
    params.set(key, value);
  }
  if (page > 1) params.set('page', String(page));

  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

function pageWindow(current: number, total: number): (number | 'gap')[] {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);

  const pages: (number | 'gap')[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  if (start > 2) pages.push('gap');
  for (let page = start; page <= end; page += 1) pages.push(page);
  if (end < total - 1) pages.push('gap');
  pages.push(total);

  return pages;
}

const ITEM_CLASSES =
  'inline-flex h-10 min-w-10 items-center justify-center rounded-lg border px-3 text-sm font-medium transition-colors';

export function Pagination({
  meta,
  basePath,
  searchParams = {},
  className,
}: {
  meta: PaginationMeta;
  basePath: string;
  searchParams?: Record<string, string | undefined>;
  className?: string;
}) {
  if (meta.totalPages <= 1) return null;

  return (
    <nav aria-label="Pagination" className={cn('flex items-center justify-center gap-1.5', className)}>
      {meta.hasPreviousPage ? (
        <Link
          href={buildHref(basePath, searchParams, meta.page - 1)}
          className={cn(ITEM_CLASSES, 'border-border text-text-secondary hover:border-primary hover:text-primary')}
          aria-label="Previous page"
          rel="prev"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
        </Link>
      ) : (
        <span
          className={cn(ITEM_CLASSES, 'border-border text-text-muted opacity-50')}
          aria-hidden="true"
        >
          <ChevronLeft className="size-4" />
        </span>
      )}

      {pageWindow(meta.page, meta.totalPages).map((entry, index) =>
        entry === 'gap' ? (
          <span key={`gap-${index}`} className="px-1 text-text-muted" aria-hidden="true">
            …
          </span>
        ) : (
          <Link
            key={entry}
            href={buildHref(basePath, searchParams, entry)}
            aria-current={entry === meta.page ? 'page' : undefined}
            className={cn(
              ITEM_CLASSES,
              entry === meta.page
                ? 'border-primary bg-primary text-text-on-primary'
                : 'border-border text-text-secondary hover:border-primary hover:text-primary',
            )}
          >
            {entry}
          </Link>
        ),
      )}

      {meta.hasNextPage ? (
        <Link
          href={buildHref(basePath, searchParams, meta.page + 1)}
          className={cn(ITEM_CLASSES, 'border-border text-text-secondary hover:border-primary hover:text-primary')}
          aria-label="Next page"
          rel="next"
        >
          <ChevronRight className="size-4" aria-hidden="true" />
        </Link>
      ) : (
        <span
          className={cn(ITEM_CLASSES, 'border-border text-text-muted opacity-50')}
          aria-hidden="true"
        >
          <ChevronRight className="size-4" />
        </span>
      )}
    </nav>
  );
}
