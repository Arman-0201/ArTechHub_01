import { resolveLocaleChain } from '@academy/types';
import { DICTIONARIES, type Dictionary } from './dictionaries';

/**
 * Resolves a flat message catalogue for a locale.
 *
 * Two layers, merged with the more specific winning:
 *   1. built-in dictionaries (compiled, always complete for `en`)
 *   2. the administrator-editable catalogue served by the API
 *
 * Within each layer, the locale chain is walked from least to most specific
 * (`en` -> `en-GB`), so a partially translated locale never renders a raw key.
 */
export function buildMessages(locale: string, remote?: Record<string, string>): Dictionary {
  const chain = resolveLocaleChain(locale);
  const merged: Dictionary = {};

  // Least specific first so more specific entries overwrite.
  for (const candidate of [...chain].reverse()) {
    Object.assign(merged, DICTIONARIES[candidate] ?? {});
  }

  if (remote) {
    for (const [key, value] of Object.entries(remote)) {
      if (typeof value === 'string' && value.trim().length > 0) merged[key] = value;
    }
  }

  return merged;
}

export type Translator = (key: string, params?: Record<string, string | number>) => string;

/**
 * Creates a translate function.
 *
 * A missing key returns the key itself rather than an empty string: an
 * untranslated label is a visible bug, a blank one is an invisible one.
 * Interpolation uses `{name}` placeholders.
 */
export function createTranslator(messages: Dictionary): Translator {
  return (key, params) => {
    const template = messages[key] ?? key;
    if (!params) return template;

    return template.replace(/\{(\w+)\}/g, (match, name: string) =>
      name in params ? String(params[name]) : match,
    );
  };
}
