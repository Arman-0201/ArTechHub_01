import type { Metadata } from 'next';
import type { SeoDto } from '@academy/types';
import { LOCALE_CODES } from '@academy/types';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

/**
 * Builds Next metadata from the CMS-managed SEO record.
 *
 * Two things it always does, because forgetting either is the most common SEO
 * defect in a multilingual site:
 *   - a canonical URL that includes the locale prefix;
 *   - `hreflang` alternates for every supported locale, so the variants are
 *     understood as translations rather than duplicate content.
 */
export function buildPageMetadata(input: {
  seo: SeoDto | null;
  locale: string;
  path: string;
  fallbackTitle?: string;
  fallbackDescription?: string;
  imageUrl?: string | null;
  type?: 'website' | 'article';
  publishedTime?: string | null;
  modifiedTime?: string | null;
}): Metadata {
  const { seo, locale, path } = input;

  const normalisedPath = path === '/' ? '' : path.startsWith('/') ? path : `/${path}`;
  const canonical = seo?.canonicalUrl ?? `${SITE_URL}/${locale}${normalisedPath}`;

  const title = seo?.title ?? input.fallbackTitle;
  const description = seo?.description ?? input.fallbackDescription;
  const image = seo?.ogImageUrl ?? input.imageUrl ?? undefined;

  const metadata: Metadata = {
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    ...(seo?.keywords && seo.keywords.length > 0 ? { keywords: seo.keywords } : {}),
    alternates: {
      canonical,
      languages: Object.fromEntries(
        LOCALE_CODES.map((code) => [code, `${SITE_URL}/${code}${normalisedPath}`]),
      ),
    },
    openGraph: {
      type: input.type ?? 'website',
      url: canonical,
      locale,
      ...(seo?.ogTitle ?? title ? { title: seo?.ogTitle ?? title } : {}),
      ...(seo?.ogDescription ?? description
        ? { description: seo?.ogDescription ?? description }
        : {}),
      ...(image ? { images: [{ url: image }] } : {}),
      ...(input.type === 'article'
        ? {
            ...(input.publishedTime ? { publishedTime: input.publishedTime } : {}),
            ...(input.modifiedTime ? { modifiedTime: input.modifiedTime } : {}),
          }
        : {}),
    },
    twitter: {
      card: (seo?.twitterCard as 'summary_large_image') ?? 'summary_large_image',
      ...(title ? { title } : {}),
      ...(description ? { description } : {}),
      ...(image ? { images: [image] } : {}),
    },
  };

  if (seo?.robots) {
    const directives = seo.robots.toLowerCase();
    metadata.robots = {
      index: !directives.includes('noindex'),
      follow: !directives.includes('nofollow'),
    };
  }

  return metadata;
}

/**
 * JSON-LD helpers.
 *
 * Structured data is emitted as a `<script type="application/ld+json">` whose
 * content is JSON-serialised — never interpolated string markup — so the values
 * cannot break out of the script context.
 */
export function courseStructuredData(input: {
  name: string;
  description: string | null;
  url: string;
  imageUrl?: string | null;
  providerName: string;
  providerUrl: string;
  instructors: { name: string }[];
  isFree: boolean;
  priceCents?: number | null;
  currency?: string | null;
}): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Course',
    name: input.name,
    ...(input.description ? { description: input.description } : {}),
    url: input.url,
    ...(input.imageUrl ? { image: input.imageUrl } : {}),
    provider: {
      '@type': 'Organization',
      name: input.providerName,
      sameAs: input.providerUrl,
    },
    ...(input.instructors.length > 0
      ? {
          instructor: input.instructors.map((instructor) => ({
            '@type': 'Person',
            name: instructor.name,
          })),
        }
      : {}),
    offers: {
      '@type': 'Offer',
      category: input.isFree ? 'Free' : 'Paid',
      price: input.isFree ? '0' : ((input.priceCents ?? 0) / 100).toFixed(2),
      priceCurrency: input.currency ?? 'USD',
      availability: 'https://schema.org/InStock',
    },
    hasCourseInstance: {
      '@type': 'CourseInstance',
      courseMode: 'online',
    },
  };
}

export function articleStructuredData(input: {
  headline: string;
  description: string | null;
  url: string;
  imageUrl?: string | null;
  authorName?: string | null;
  publishedAt: string | null;
  modifiedAt: string | null;
  publisherName: string;
}): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: input.headline,
    ...(input.description ? { description: input.description } : {}),
    url: input.url,
    ...(input.imageUrl ? { image: input.imageUrl } : {}),
    ...(input.authorName ? { author: { '@type': 'Person', name: input.authorName } } : {}),
    ...(input.publishedAt ? { datePublished: input.publishedAt } : {}),
    ...(input.modifiedAt ? { dateModified: input.modifiedAt } : {}),
    publisher: { '@type': 'Organization', name: input.publisherName },
  };
}

export function breadcrumbStructuredData(
  items: { name: string; url: string }[],
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

export function faqStructuredData(
  items: { question: string; answer: string }[],
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  };
}

export function siteUrl(locale: string, path = ''): string {
  const normalised = path === '/' ? '' : path.startsWith('/') ? path : `/${path}`;
  return `${SITE_URL}/${locale}${normalised}`;
}

export { SITE_URL };
