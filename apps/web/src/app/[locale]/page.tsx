import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPage } from '@/lib/api/queries';
import { resolveSectionData } from '@/lib/api/page-data';
import { PageRenderer } from '@/components/sections/registry';
import { buildPageMetadata } from '@/lib/seo';

/**
 * Home page.
 *
 * Entirely CMS-driven: it loads the `home` page and renders its sections
 * through the registry. There is no hardcoded marketing copy in this file, so
 * an administrator can restructure the landing page without a deploy.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const page = await getPage('home', locale);
  return buildPageMetadata({ seo: page?.seo ?? null, locale, path: '/' });
}

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;

  const page = await getPage('home', locale);
  // The seed guarantees a `home` page exists; a 404 here means the database was
  // never seeded, which is worth surfacing rather than papering over.
  if (!page) notFound();

  const data = await resolveSectionData(page, locale);

  return <PageRenderer page={page} locale={locale} data={data} />;
}
