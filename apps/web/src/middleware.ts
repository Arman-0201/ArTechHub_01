import { NextResponse, type NextRequest } from 'next/server';
import { DEFAULT_LOCALE, LOCALE_CODES } from '@academy/types';
import { LOCALE_COOKIE } from '@/lib/i18n/config';

/**
 * Locale routing.
 *
 * Every page URL carries its locale as the first segment. A request without one
 * is redirected to the visitor's best match, chosen from:
 *   1. their saved preference cookie
 *   2. the `Accept-Language` header, including base-language matches
 *   3. the platform default
 *
 * Static assets and API routes are excluded by the matcher below rather than by
 * checks here, so the middleware does no work for them at all.
 */

const PUBLIC_FILE = /\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|txt|xml|json|webmanifest|woff2?)$/i;

function pickLocale(request: NextRequest): string {
  const cookieLocale = request.cookies.get(LOCALE_COOKIE)?.value;
  if (cookieLocale && (LOCALE_CODES as string[]).includes(cookieLocale)) {
    return cookieLocale;
  }

  const header = request.headers.get('accept-language');
  if (header) {
    const preferences = header
      .split(',')
      .map((part) => {
        const [tag, ...rest] = part.trim().split(';');
        const qualityPart = rest.find((entry) => entry.trim().startsWith('q='));
        const quality = qualityPart ? Number.parseFloat(qualityPart.split('=')[1] ?? '1') : 1;
        return { tag: (tag ?? '').trim(), quality: Number.isFinite(quality) ? quality : 0 };
      })
      .filter((entry) => entry.tag.length > 0)
      .sort((a, b) => b.quality - a.quality);

    for (const preference of preferences) {
      if ((LOCALE_CODES as string[]).includes(preference.tag)) return preference.tag;
      const base = preference.tag.split('-')[0];
      if (base && (LOCALE_CODES as string[]).includes(base)) return base;
    }
  }

  return DEFAULT_LOCALE;
}

export function middleware(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;

  if (PUBLIC_FILE.test(pathname)) return NextResponse.next();

  const segments = pathname.split('/').filter(Boolean);
  const firstSegment = segments[0];

  if (firstSegment && (LOCALE_CODES as string[]).includes(firstSegment)) {
    const response = NextResponse.next();
    // Remember the locale actually being used, so a later visit to `/` lands
    // in the same language.
    if (request.cookies.get(LOCALE_COOKIE)?.value !== firstSegment) {
      response.cookies.set(LOCALE_COOKIE, firstSegment, {
        path: '/',
        maxAge: 60 * 60 * 24 * 365,
        sameSite: 'lax',
      });
    }
    // Expose the locale to server components that need it outside the route
    // params (error boundaries, not-found).
    response.headers.set('x-locale', firstSegment);
    return response;
  }

  const locale = pickLocale(request);
  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname === '/' ? '' : pathname}`;
  url.search = search;

  return NextResponse.redirect(url);
}

export const config = {
  // Everything except Next internals, the API proxy routes, and files with an
  // extension.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|api/).*)'],
};
