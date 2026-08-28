import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { CollectionPanelDto, CollectionTone } from '@academy/types';
import { getCollectionEntry } from '@/lib/api/queries';
import { buildPageMetadata } from '@/lib/seo';
import { localePath } from '@/lib/i18n/config';
import { Badge, Breadcrumbs } from '@/components/ui';
import { EntryPanel, FactList } from '@/components/collections/entry-panels';

/**
 * One entry of a reference collection.
 *
 * Two columns, and which one a panel lands in is the author's decision rather
 * than this file's: a panel carries its own `column`, so the summary facts and
 * the related links sit in the sidebar while the prose and the tables run down
 * the main column. On a narrow screen the sidebar stacks under the main
 * content, which is the right order to read them in anyway.
 *
 * The quick-facts panel is the one exception — it is drawn from the entry's own
 * `facts`, above whatever else the sidebar holds, because every entry in a
 * collection has the same handful and nobody should have to add that panel a
 * hundred times.
 */

export const dynamic = 'force-dynamic';

const TONE_BADGE = {
  DEFAULT: 'neutral',
  INFO: 'primary',
  SUCCESS: 'success',
  WARNING: 'warning',
  DANGER: 'danger',
} as const satisfies Record<CollectionTone, string>;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; collection: string; entry: string }>;
}): Promise<Metadata> {
  const { locale, collection, entry: entrySlug } = await params;
  const result = await getCollectionEntry(collection, entrySlug, locale);
  if (!result) return { title: 'Not found' };

  const title = result.entry.subtitle
    ? `${result.entry.title} (${result.entry.subtitle})`
    : result.entry.title;

  return buildPageMetadata({
    seo: null,
    locale,
    path: `/reference/${result.collection.slug}/${result.entry.slug}`,
    fallbackTitle: title,
    ...(result.entry.summary ? { fallbackDescription: result.entry.summary } : {}),
    type: 'article',
    modifiedTime: result.entry.updatedAt,
    publishedTime: result.entry.publishedAt,
  });
}

export default async function CollectionEntryPage({
  params,
}: {
  params: Promise<{ locale: string; collection: string; entry: string }>;
}) {
  const { locale, collection: collectionSlug, entry: entrySlug } = await params;

  const result = await getCollectionEntry(collectionSlug, entrySlug, locale);
  if (!result) notFound();

  const { collection, entry } = result;

  const isSide = (panel: CollectionPanelDto) => panel.column === 'SIDE';
  const mainPanels = entry.panels.filter((panel) => !isSide(panel));
  const sidePanels = entry.panels.filter(isSide);
  const hasSidebar = entry.facts.length > 0 || sidePanels.length > 0;

  return (
    <div className="py-8 sm:py-12">
      <div className="container-page">
        <Breadcrumbs
          items={[
            { label: collection.name, href: localePath(locale, `/reference/${collection.slug}`) },
            { label: entry.title },
          ]}
        />

        <header className="mt-6 max-w-3xl">
          <div className="flex flex-wrap items-center gap-2">
            {entry.badge ? <Badge tone="primary">{entry.badge}</Badge> : null}
            {entry.category ? <Badge>{entry.category.name}</Badge> : null}
            {entry.tone !== 'DEFAULT' ? (
              <Badge tone={TONE_BADGE[entry.tone]}>
                {entry.tone === 'DANGER' ? 'Dangerous' : entry.tone.toLowerCase()}
              </Badge>
            ) : null}
          </div>

          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-text-primary sm:text-4xl">
            {entry.title}
            {entry.subtitle ? (
              <span className="ml-2 text-primary">({entry.subtitle})</span>
            ) : null}
          </h1>

          {entry.summary ? (
            <p className="mt-3 text-lg leading-relaxed text-text-secondary">{entry.summary}</p>
          ) : null}
        </header>

        <div
          className={
            hasSidebar
              ? 'mt-8 grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start'
              : 'mt-8 max-w-3xl space-y-5'
          }
        >
          <div className="space-y-5">
            {mainPanels.map((panel) => (
              <EntryPanel key={panel.id} panel={panel} />
            ))}
          </div>

          {hasSidebar ? (
            // `lg:sticky` keeps the summary in view while a long entry scrolls,
            // which is what makes a sidebar worth having on a reference page.
            <aside className="space-y-5 lg:sticky lg:top-24">
              {entry.facts.length > 0 ? (
                <section className="rounded-xl border border-border bg-surface">
                  <header className="border-b border-border px-5 py-3.5">
                    <h2 className="text-sm font-semibold text-text-primary">Quick info</h2>
                  </header>
                  <div className="px-5 py-4">
                    <FactList facts={entry.facts} />
                  </div>
                </section>
              ) : null}

              {sidePanels.map((panel) => (
                <EntryPanel key={panel.id} panel={panel} />
              ))}
            </aside>
          ) : null}
        </div>
      </div>
    </div>
  );
}
