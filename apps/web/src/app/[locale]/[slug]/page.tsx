import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPage } from '@/lib/api/queries';
import { resolveSectionData } from '@/lib/api/page-data';
import { buildPageMetadata, faqStructuredData } from '@/lib/seo';
import { PageRenderer } from '@/components/sections/registry';
import { StructuredData } from '@/components/seo/structured-data';
import { ContactForm } from '@/components/forms/contact-form';

/**
 * Catch-all CMS page.
 *
 * Any page an administrator creates becomes reachable at `/{locale}/{slug}`
 * with no code change — about, faq, contact and anything added later all route
 * through here. It sits last in the route hierarchy, so real routes
 * (`/courses`, `/blog`, …) always win over a CMS slug of the same name.
 */

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const page = await getPage(slug, locale);
  if (!page) return { title: 'Page not found' };

  return buildPageMetadata({
    seo: page.seo,
    locale,
    path: `/${page.slug}`,
    fallbackTitle: page.title,
  });
}

export default async function DynamicCmsPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;

  const page = await getPage(slug, locale);
  // A disabled or unpublished page answers 404 — the API decides, not this file.
  if (!page) notFound();

  const data = await resolveSectionData(page, locale);

  // FAQ content is structured data the search engines understand; emitting it
  // is free and materially improves how the page appears in results.
  const faqSection = page.sections.find((section) => section.type === 'FAQ');
  const faqItems = Array.isArray(faqSection?.content.items)
    ? (faqSection.content.items as { question: string; answer: string }[])
    : [];

  return (
    <>
      {faqItems.length > 0 ? <StructuredData data={faqStructuredData(faqItems)} /> : null}

      <PageRenderer page={page} locale={locale} data={data} />

      {/* The contact page needs a form, which is not a CMS section type — the
          section supplies the copy above it, this supplies the interaction. */}
      {page.slug === 'contact' ? (
        <section className="pb-16 sm:pb-20">
          <div className="container-page">
            <ContactForm />
          </div>
        </section>
      ) : null}
    </>
  );
}
