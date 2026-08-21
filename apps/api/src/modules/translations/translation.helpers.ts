import { resolveLocaleChain } from '@academy/types';

/**
 * Translation fallback.
 *
 * Content is authored in a source language and translated per locale. A missing
 * translation must never render as an empty heading, so lookup walks the locale
 * chain (`en-GB` -> `en`) and finally falls back to the source columns.
 */

export interface LocalisedRow {
  locale: string;
}

export function pickTranslation<T extends LocalisedRow>(
  translations: T[] | undefined,
  locale: string,
): T | undefined {
  if (!translations || translations.length === 0) return undefined;

  for (const candidate of resolveLocaleChain(locale)) {
    const match = translations.find((translation) => translation.locale === candidate);
    if (match) return match;
  }
  return undefined;
}

/**
 * Returns the translated value when it is actually present, otherwise the
 * source value. An empty string counts as "not translated" — a translator who
 * clears a field should not blank the page.
 */
export function applyTranslation<T>(source: T, translated: T | null | undefined): T {
  if (translated === null || translated === undefined) return source;
  if (typeof translated === 'string' && translated.trim().length === 0) return source;
  return translated;
}

/** Merges a translated JSON object over the source object, key by key. */
export function mergeTranslatedContent(
  source: Record<string, unknown>,
  translated: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!translated) return source;
  const merged: Record<string, unknown> = { ...source };
  for (const [key, value] of Object.entries(translated)) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'string' && value.trim().length === 0) continue;
    merged[key] = value;
  }
  return merged;
}
