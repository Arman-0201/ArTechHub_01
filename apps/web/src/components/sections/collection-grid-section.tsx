import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { localePath } from '@/lib/i18n/config';
import { SectionHeading } from '@/components/ui';
import { CollectionGrid } from '@/components/collections/collection-grid';
import { readBoolean, readNumber, readOptionalString, readString, type SectionProps } from './types';

/**
 * A reference collection, dropped onto any CMS page.
 *
 * This is what makes "put a search on that page" a page-builder decision rather
 * than a code change: pick a collection, and the section renders the same
 * searchable, filterable grid the collection's own index page uses. Cards link
 * to `/reference/{collection}/{entry}` either way, so an entry has one URL no
 * matter how many pages point at it.
 *
 * `limit` trims the grid for a page that is showing a taste of a collection
 * rather than all of it — a homepage strip of six ports under a "browse all"
 * link. Search is off by default in that case, because searching six of a
 * hundred entries is a worse answer than following the link.
 */
export function CollectionGridSection({ section, locale, data }: SectionProps) {
  const slug = readOptionalString(section.content, 'collectionSlug');
  if (!slug) return null;

  const index = data.collections[slug];
  // The page listed a collection that has since been unpublished or deleted.
  // Rendering nothing matches how the registry skips an unknown section type.
  if (!index) return null;

  const limit = readNumber(section.settings, 'limit', 0);
  const entries = limit > 0 ? index.entries.slice(0, limit) : index.entries;
  const isTrimmed = entries.length < index.entries.length;

  const heading = readString(section.content, 'title') || index.collection.name;
  const description =
    readOptionalString(section.content, 'description') ?? index.collection.description ?? undefined;

  return (
    <section className="bg-background py-14 sm:py-20">
      <div className="container-page">
        <SectionHeading
          title={heading}
          {...(description ? { description } : {})}
          align="center"
          className="mb-8"
        />

        <CollectionGrid
          locale={locale}
          collectionSlug={index.collection.slug}
          entries={entries}
          // A trimmed grid hides its chips too: filtering a slice of a
          // collection shows counts that do not match what is on screen.
          categories={isTrimmed ? [] : index.collection.categories}
          searchPlaceholder={index.collection.searchPlaceholder}
          showSearch={readBoolean(section.settings, 'showSearch', !isTrimmed)}
          columns={readNumber(section.settings, 'columns', 3)}
        />

        {isTrimmed ? (
          <div className="mt-8 text-center">
            <Link
              href={localePath(locale, `/reference/${index.collection.slug}`)}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
            >
              Browse all {index.collection.entryCount}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        ) : null}
      </div>
    </section>
  );
}
