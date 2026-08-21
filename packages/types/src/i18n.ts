/**
 * Locale catalogue. `en-GB` is modelled as a *variant* of English rather than a
 * separate language: it falls back to `en` for any key it does not override.
 */

export interface LocaleDefinition {
  /** BCP-47 code used in URLs and the `Accept-Language` negotiation. */
  code: string;
  /** ISO-639 base language; variants share it. */
  language: string;
  /** English name, for admin UIs. */
  name: string;
  /** Endonym, for the public language switcher. */
  nativeName: string;
  direction: 'ltr' | 'rtl';
  /** Locale consulted when a key is missing here. */
  fallback?: string;
  flag: string;
}

export const LOCALES: LocaleDefinition[] = [
  { code: 'en', language: 'en', name: 'English (US)', nativeName: 'English', direction: 'ltr', flag: '🇺🇸' },
  { code: 'en-GB', language: 'en', name: 'English (UK)', nativeName: 'English (UK)', direction: 'ltr', fallback: 'en', flag: '🇬🇧' },
  { code: 'hy', language: 'hy', name: 'Armenian', nativeName: 'Հայերեն', direction: 'ltr', fallback: 'en', flag: '🇦🇲' },
  { code: 'ru', language: 'ru', name: 'Russian', nativeName: 'Русский', direction: 'ltr', fallback: 'en', flag: '🇷🇺' },
  { code: 'de', language: 'de', name: 'German', nativeName: 'Deutsch', direction: 'ltr', fallback: 'en', flag: '🇩🇪' },
  { code: 'es', language: 'es', name: 'Spanish', nativeName: 'Español', direction: 'ltr', fallback: 'en', flag: '🇪🇸' },
  { code: 'it', language: 'it', name: 'Italian', nativeName: 'Italiano', direction: 'ltr', fallback: 'en', flag: '🇮🇹' },
  { code: 'fr', language: 'fr', name: 'French', nativeName: 'Français', direction: 'ltr', fallback: 'en', flag: '🇫🇷' },
];

export const LOCALE_CODES = LOCALES.map((locale) => locale.code);
export const DEFAULT_LOCALE = 'en';

export function isSupportedLocale(value: string | null | undefined): boolean {
  return typeof value === 'string' && LOCALE_CODES.includes(value);
}

export function getLocaleDefinition(code: string): LocaleDefinition | undefined {
  return LOCALES.find((locale) => locale.code === code);
}

/**
 * Ordered chain of locales to try for a given code, e.g.
 * `en-GB` -> ['en-GB', 'en'] and `hy` -> ['hy', 'en'].
 */
export function resolveLocaleChain(code: string): string[] {
  const chain: string[] = [];
  let current: string | undefined = code;
  const guard = new Set<string>();
  while (current && !guard.has(current)) {
    guard.add(current);
    chain.push(current);
    current = getLocaleDefinition(current)?.fallback;
  }
  if (!chain.includes(DEFAULT_LOCALE)) chain.push(DEFAULT_LOCALE);
  return chain;
}
