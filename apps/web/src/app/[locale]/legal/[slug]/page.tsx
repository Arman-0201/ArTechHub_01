import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getLegalDocument } from '@/lib/api/queries';
import { buildPageMetadata } from '@/lib/seo';
import { localePath } from '@/lib/i18n/config';
import { formatDate } from '@/lib/utils';
import { Breadcrumbs } from '@/components/ui';
import { RichText } from '@/components/content/rich-text';

export const revalidate = 600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const document = await getLegalDocument(slug, locale);
  if (!document) return { title: 'Document not found' };

  return buildPageMetadata({
    seo: null,
    locale,
    path: `/legal/${document.slug}`,
    fallbackTitle: document.title,
  });
}

export default async function LegalDocumentPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;

  const document = await getLegalDocument(slug, locale);
  // A document with no published version is treated as not existing, which is
  // the correct answer for a policy nobody has approved yet.
  if (!document || !document.currentVersion) notFound();

  return (
    <article className="py-10 sm:py-14">
      <div className="container-page">
        <div className="container-prose">
          <Breadcrumbs
            items={[
              { label: 'Home', href: localePath(locale, '/') },
              { label: document.title },
            ]}
            className="mb-8"
          />

          <header className="space-y-3 border-b border-border pb-6">
            <h1 className="text-3xl font-semibold tracking-tight text-text-primary sm:text-4xl">
              {document.title}
            </h1>
            <p className="text-sm text-text-muted">
              Version {document.currentVersion.version} · effective{' '}
              <time dateTime={document.currentVersion.effectiveAt}>
                {formatDate(document.currentVersion.effectiveAt, locale)}
              </time>
            </p>
          </header>

          <RichText document={document.currentVersion.body} className="mt-8" />
        </div>
      </div>
    </article>
  );
}
