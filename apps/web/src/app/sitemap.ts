import type { MetadataRoute } from 'next';
import { LOCALE_CODES } from '@academy/types';
import { serverFetch } from '@/lib/api/server';
import { SITE_URL } from '@/lib/seo';

interface SitemapEntry {
  path: string;
  lastModified: string;
  changeFrequency: 'daily' | 'weekly' | 'monthly';
  priority: number;
}

/**
 * Sitemap.
 *
 * The API enumerates every publicly reachable path; this expands each one
 * across the supported locales and attaches `alternates.languages`, so search
 * engines treat the variants as translations rather than duplicates.
 *
 * Revalidated hourly — new courses and articles should appear without a
 * deployment, but the query is not cheap enough to run per request.
 */
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let entries: SitemapEntry[] = [];

  try {
    entries = await serverFetch<SitemapEntry[]>('/site/sitemap', { revalidate: 3600 });
  } catch {
    // A sitemap that briefly lists only the home page is far better than a
    // build or request failure.
    entries = [
      { path: '/', lastModified: new Date().toISOString(), changeFrequency: 'daily', priority: 1 },
    ];
  }

  return entries.flatMap((entry) =>
    LOCALE_CODES.map((locale) => ({
      url: `${SITE_URL}/${locale}${entry.path === '/' ? '' : entry.path}`,
      lastModified: new Date(entry.lastModified),
      changeFrequency: entry.changeFrequency,
      priority: entry.priority,
      alternates: {
        languages: Object.fromEntries(
          LOCALE_CODES.map((alternate) => [
            alternate,
            `${SITE_URL}/${alternate}${entry.path === '/' ? '' : entry.path}`,
          ]),
        ),
      },
    })),
  );
}
