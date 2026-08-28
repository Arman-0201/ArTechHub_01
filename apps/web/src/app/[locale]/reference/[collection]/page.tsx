import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import * as Icons from 'lucide-react';
import { BookMarked } from 'lucide-react';
import { getCollection } from '@/lib/api/queries';
import { buildPageMetadata } from '@/lib/seo';
import { CollectionGrid } from '@/components/collections/collection-grid';

/**
 * A reference collection's index.
 *
 * Rendered from the collection's entries rather than authored, which is the
 * point of the whole feature: adding the hundredth port is filling in a form,
 * not laying out a hundredth page. The heading, the search box and the filter
 * chips all come from the same row the entries hang off.
 *
 * To place this grid somewhere else — a homepage, a course landing page — use
 * the `COLLECTION_GRID` section in the page builder instead. Both render the
 * same component.
 */

export const dynamic = 'force-dynamic';

function resolveIcon(name: string | null) {
  if (!name) return BookMarked;
  const candidate = (Icons as unknown as Record<string, unknown>)[name];
  return typeof candidate === 'function' ? (candidate as typeof BookMarked) : BookMarked;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; collection: string }>;
}): Promise<Metadata> {
  const { locale, collection: slug } = await params;
  const index = await getCollection(slug, locale);
  if (!index) return { title: 'Not found' };

  return buildPageMetadata({
    seo: null,
    locale,
    path: `/reference/${index.collection.slug}`,
    fallbackTitle: index.collection.name,
    ...(index.collection.description ? { fallbackDescription: index.collection.description } : {}),
  });
}

export default async function CollectionIndexPage({
  params,
}: {
  params: Promise<{ locale: string; collection: string }>;
}) {
  const { locale, collection: slug } = await params;

  const index = await getCollection(slug, locale);
  // A draft collection answers 404 — the API decides, not this file.
  if (!index) notFound();

  const { collection, entries } = index;
  const Icon = resolveIcon(collection.iconName);

  return (
    <>
      <section className="border-b border-border bg-background-subtle py-12 sm:py-16">
        <div className="container-page">
          <div className="mx-auto max-w-2xl text-center">
            {collection.eyebrow ? (
              <p className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-primary">
                <Icon className="size-3.5" aria-hidden="true" />
                {collection.eyebrow}
              </p>
            ) : null}

            <h1 className="text-3xl font-semibold tracking-tight text-text-primary sm:text-4xl">
              {collection.name}
            </h1>

            {collection.description ? (
              <p className="mt-4 text-lg leading-relaxed text-text-secondary">
                {collection.description}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="py-10 sm:py-14">
        <div className="container-page">
          <CollectionGrid
            locale={locale}
            collectionSlug={collection.slug}
            entries={entries}
            categories={collection.categories}
            searchPlaceholder={collection.searchPlaceholder}
            titleLevel="h2"
            emptyMessage="This collection has no published entries yet."
          />
        </div>
      </section>
    </>
  );
}
