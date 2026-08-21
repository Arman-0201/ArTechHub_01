import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';

/**
 * robots.txt.
 *
 * The disallow list covers areas that are either private or worthless to index:
 * the admin panel, the learner dashboard, gated lesson content, auth screens
 * and the cart. None of these are *protected* by this file — the server
 * enforces access — but keeping them out of the index avoids leaking URL
 * structure and wasting crawl budget.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/*/admin',
          '/*/admin/*',
          '/*/dashboard',
          '/*/dashboard/*',
          '/*/learn/*',
          '/*/login',
          '/*/register',
          '/*/forgot-password',
          '/*/reset-password',
          '/*/verify-account',
          '/*/auth/*',
          '/*/cart',
          '/*/checkout',
          '/*/search',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
