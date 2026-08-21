'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BookOpen, FileText, Layers, Loader2, Package, Search, X } from 'lucide-react';
import { api } from '@/lib/api/client';
import { cn } from '@/lib/utils';
import { useSite } from '@/components/providers';

interface SearchResultItem {
  type: 'course' | 'category' | 'article' | 'product';
  id: string;
  title: string;
  description: string | null;
  url: string;
}

const ICONS = {
  course: BookOpen,
  category: Layers,
  article: FileText,
  product: Package,
} as const;

/**
 * Command-palette style search.
 *
 * Querying is debounced and executed on the server — the catalogue is never
 * shipped to the browser to be filtered there. Results are keyboard navigable
 * because a search dialog that requires a mouse is a broken search dialog.
 */
export function SearchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, href } = useSite();
  const router = useRouter();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
      document.body.style.overflow = 'hidden';
    } else {
      setQuery('');
      setResults([]);
      setActiveIndex(0);
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  // Debounced so typing does not fire a request per keystroke; the abort
  // controller drops responses for queries the user has already moved past.
  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setResults([]);
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    setIsLoading(true);

    const timer = setTimeout(() => {
      api
        .get<SearchResultItem[]>('/search/suggest', {
          query: { q: query.trim() },
          signal: controller.signal,
        })
        .then((items) => {
          setResults(items);
          setActiveIndex(0);
        })
        .catch(() => setResults([]))
        .finally(() => setIsLoading(false));
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveIndex((index) => Math.min(index + 1, results.length - 1));
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex((index) => Math.max(index - 1, 0));
      }
      if (event.key === 'Enter') {
        const target = results[activeIndex];
        if (target) {
          event.preventDefault();
          onClose();
          router.push(href(target.url));
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, results, activeIndex, onClose, router, href]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label={t('action.search')}
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-[var(--color-overlay)] backdrop-blur-sm"
        onClick={onClose}
        aria-label={t('action.close')}
        tabIndex={-1}
      />

      <div className="relative w-full max-w-xl animate-[fade-up_0.2s_ease-out] overflow-hidden rounded-2xl border border-border bg-surface-raised shadow-overlay">
        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search className="size-4.5 shrink-0 text-text-muted" aria-hidden="true" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`${t('action.search')}…`}
            className="h-14 flex-1 bg-transparent text-base text-text-primary outline-none placeholder:text-text-muted"
            aria-label={t('action.search')}
            autoComplete="off"
          />
          {isLoading ? (
            <Loader2 className="size-4 animate-spin text-text-muted" aria-hidden="true" />
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="grid size-8 place-items-center rounded-md text-text-muted transition-colors hover:bg-surface-sunken"
            aria-label={t('action.close')}
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        <div className="max-h-[50vh] overflow-y-auto p-2">
          {results.length > 0 ? (
            <ul role="listbox" aria-label={t('action.search')}>
              {results.map((result, index) => {
                const Icon = ICONS[result.type];
                return (
                  <li key={result.id}>
                    <Link
                      href={href(result.url)}
                      onClick={onClose}
                      role="option"
                      aria-selected={index === activeIndex}
                      onMouseEnter={() => setActiveIndex(index)}
                      className={cn(
                        'flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors',
                        index === activeIndex ? 'bg-primary-soft' : 'hover:bg-surface-sunken',
                      )}
                    >
                      <Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-text-primary">
                          {result.title}
                        </span>
                        {result.description ? (
                          <span className="block truncate text-xs text-text-muted">
                            {result.description}
                          </span>
                        ) : null}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : query.trim().length >= 2 && !isLoading ? (
            <p className="px-3 py-8 text-center text-sm text-text-muted">{t('state.emptySearch')}</p>
          ) : (
            <p className="px-3 py-8 text-center text-sm text-text-muted">
              Type at least two characters to search courses.
            </p>
          )}
        </div>

        {query.trim().length >= 2 ? (
          <div className="border-t border-border px-4 py-2.5">
            <Link
              href={href(`/search?q=${encodeURIComponent(query.trim())}`)}
              onClick={onClose}
              className="text-sm font-medium text-primary hover:underline"
            >
              See all results for “{query.trim()}”
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}
