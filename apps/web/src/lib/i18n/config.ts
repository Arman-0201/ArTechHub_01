import { DEFAULT_LOCALE, LOCALES, LOCALE_CODES, resolveLocaleChain } from '@academy/types';

export { DEFAULT_LOCALE, LOCALES, LOCALE_CODES, resolveLocaleChain };

/**
 * URL strategy: every route is prefixed with its locale (`/en/courses`,
 * `/hy/courses`). The prefix is always present — including for the default
 * locale — because an implicit default creates two URLs for the same content,
 * which is an avoidable SEO problem and a source of subtle routing bugs.
 */
export function isValidLocale(value: string | undefined | null): boolean {
  return typeof value === 'string' && (LOCALE_CODES as string[]).includes(value);
}

export function normaliseLocale(value: string | undefined | null): string {
  if (isValidLocale(value)) return value as string;
  // `en-AU` and similar unlisted variants fall back to their base language.
  const base = value?.split('-')[0];
  if (isValidLocale(base)) return base as string;
  return DEFAULT_LOCALE;
}

/** Prefixes a site-relative path with the locale segment. */
export function localePath(locale: string, path: string): string {
  const normalised = path.startsWith('/') ? path : `/${path}`;
  if (normalised === '/') return `/${locale}`;
  return `/${locale}${normalised}`;
}

/** Swaps the locale segment of a path, preserving everything after it. */
export function swapLocaleInPath(pathname: string, nextLocale: string): string {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length > 0 && isValidLocale(segments[0])) {
    segments[0] = nextLocale;
    return `/${segments.join('/')}`;
  }
  return localePath(nextLocale, pathname);
}

/** Locale for the `lang` attribute and `Intl` formatting. */
export function htmlLang(locale: string): string {
  return locale;
}

export function localeDirection(locale: string): 'ltr' | 'rtl' {
  return LOCALES.find((entry) => entry.code === locale)?.direction ?? 'ltr';
}

export const LOCALE_COOKIE = 'academy_locale';
