import type { Metadata } from 'next';
import Link from 'next/link';
import { BookOpen, FileText, Layers, Package, SearchX } from 'lucide-react';
import type { PaginationMeta } from '@academy/types';
import { serverRequest } from '@/lib/api/server';
import { ApiError } from '@/lib/api/types';
import { localePath } from '@/lib/i18n/config';
import { EmptyState } from '@/components/ui';
import { Pagination } from '@/components/ui/pagination';
import { SearchForm } from '@/components/search/search-form';

export const metadata: Metadata = {
  title: 'Search',
  description: 'Search courses, tracks and articles.',
  // A search results page has no stable content of its own worth indexing.
  robots: { index: false, follow: true },
};

export const dynamic = 'force-dynamic';

interface SearchResultItem {
  type: 'course' | 'category' | 'article' | 'product';
  id: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  url: string;
}

const ICONS = {
  course: BookOpen,
  category: Layers,
  article: FileText,
  product: Package,
} as const;

const TYPE_LABELS = {
  course: 'Course',
  category: 'Track',
  article: 'Article',
  product: 'Product',
} as const;

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; type?: string; page?: string }>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);

  const term = (query.q ?? '').trim();
  const page = Math.max(1, Number.parseInt(query.page ?? '1', 10) || 1);

  let items: SearchResultItem[] = [];
  let meta: PaginationMeta | undefined;
  let counts: Record<string, number> | undefined;
  let error: string | null = null;

  if (term.length >= 2) {
    try {
      const result = await serverRequest<{
        items: SearchResultItem[];
        counts: Record<string, number>;
      }>('/search', {
        locale,
        query: { q: term, type: query.type ?? 'all', page, pageSize: 12 },
      });
      items = result.data.items;
      counts = result.data.counts;
      meta = result.meta;
    } catch (caught) {
      error =
        caught instanceof ApiError
          ? caught.message
          : 'Search is unavailable right now. Please try again.';
    }
  }

  const filters = [
    { value: 'all', label: 'Everything' },
    { value: 'courses', label: `Courses${counts ? ` (${counts.courses})` : ''}` },
    { value: 'categories', label: `Tracks${counts ? ` (${counts.categories})` : ''}` },
    { value: 'blog', label: `Articles${counts ? ` (${counts.articles})` : ''}` },
  ];

  const activeType = query.type ?? 'all';

  return (
    <section className="py-10 sm:py-14">
      <div className="container-page">
        <div className="mx-auto max-w-3xl space-y-6">
          <header className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight text-text-primary">Search</h1>
            <p className="text-text-secondary">Find a course, a track or an article.</p>
          </header>

          <SearchForm initialQuery={term} locale={locale} />

          {term.length > 0 && term.length < 2 ? (
            <p className="text-sm text-text-muted">Enter at least two characters.</p>
          ) : null}

          {term.length >= 2 ? (
            <>
              <nav aria-label="Filter results">
                <ul className="flex flex-wrap gap-2">
                  {filters.map((filter) => (
                    <li key={filter.value}>
                      <Link
                        href={localePath(
                          locale,
                          `/search?q=${encodeURIComponent(term)}${filter.value === 'all' ? '' : `&type=${filter.value}`}`,
                        )}
                        aria-current={activeType === filter.value ? 'page' : undefined}
                        className={
                          activeType === filter.value
                            ? 'inline-flex rounded-full border border-primary bg-primary px-3.5 py-1.5 text-sm text-text-on-primary'
                            : 'inline-flex rounded-full border border-border px-3.5 py-1.5 text-sm text-text-secondary transition-colors hover:border-primary hover:text-primary'
                        }
                      >
                        {filter.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>

              {error ? (
                <p className="rounded-lg border border-danger/25 bg-danger-soft px-4 py-3 text-sm text-danger">
                  {error}
                </p>
              ) : items.length > 0 ? (
                <>
                  <p className="text-sm text-text-muted" aria-live="polite">
                    {meta?.total ?? items.length} result
                    {(meta?.total ?? items.length) === 1 ? '' : 's'} for “{term}”
                  </p>

                  <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
                    {items.map((item) => {
                      const Icon = ICONS[item.type];
                      return (
                        <li key={`${item.type}-${item.id}`}>
                          <Link
                            href={localePath(locale, item.url)}
                            className="flex items-start gap-4 p-4 transition-colors hover:bg-surface-sunken"
                          >
                            {item.imageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={item.imageUrl}
                                alt=""
                                className="size-12 shrink-0 rounded-lg object-cover"
                                loading="lazy"
                              />
                            ) : (
                              <span
                                className="grid size-12 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary"
                                aria-hidden="true"
                              >
                                <Icon className="size-5" />
                              </span>
                            )}

                            <span className="min-w-0 flex-1">
                              <span className="block text-2xs font-semibold uppercase tracking-wider text-primary">
                                {TYPE_LABELS[item.type]}
                              </span>
                              <span className="block truncate font-medium text-text-primary">
                                {item.title}
                              </span>
                              {item.description ? (
                                <span className="line-clamp-2 block text-sm text-text-secondary">
                                  {item.description}
                                </span>
                              ) : null}
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>

                  {meta && meta.totalPages > 1 ? (
                    <Pagination
                      meta={meta}
                      basePath={localePath(locale, '/search')}
                      searchParams={{ q: term, type: activeType === 'all' ? undefined : activeType }}
                    />
                  ) : null}
                </>
              ) : (
                <EmptyState
                  icon={<SearchX className="size-8" />}
                  title={`Nothing matched “${term}”.`}
                  description="Try a shorter or more general term, or browse the catalogue."
                  action={
                    <Link
                      href={localePath(locale, '/courses')}
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      Browse all courses
                    </Link>
                  }
                />
              )}
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}
