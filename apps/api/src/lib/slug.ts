/**
 * Slug generation.
 *
 * Titles arrive in eight locales including Armenian and Russian, so a naive
 * `[^a-z0-9]` filter would reduce "Ցանցեր" to an empty string. Non-Latin
 * scripts are transliterated first; if nothing usable survives, the caller
 * falls back to a random suffix rather than producing an empty slug.
 */

const TRANSLITERATION: Record<string, string> = {
  // Armenian
  ա: 'a', բ: 'b', գ: 'g', դ: 'd', ե: 'e', զ: 'z', է: 'e', ը: 'y', թ: 't', ժ: 'zh',
  ի: 'i', լ: 'l', խ: 'kh', ծ: 'ts', կ: 'k', հ: 'h', ձ: 'dz', ղ: 'gh', ճ: 'ch', մ: 'm',
  յ: 'y', ն: 'n', շ: 'sh', ո: 'o', չ: 'ch', պ: 'p', ջ: 'j', ռ: 'r', ս: 's', վ: 'v',
  տ: 't', ր: 'r', ց: 'ts', ւ: 'v', փ: 'p', ք: 'q', օ: 'o', ֆ: 'f', և: 'ev',
  // Cyrillic
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i',
  й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
  у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '',
  э: 'e', ю: 'yu', я: 'ya',
  // Latin extras that NFD does not decompose
  ß: 'ss', æ: 'ae', ø: 'o', œ: 'oe', đ: 'd', ł: 'l', þ: 'th', ð: 'd',
};

export function slugify(input: string): string {
  const transliterated = Array.from(input.toLowerCase())
    .map((char) => TRANSLITERATION[char] ?? char)
    .join('');

  return transliterated
    // Strip combining accents (é -> e) without touching base letters.
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 160)
    .replace(/-+$/g, '');
}

function randomSuffix(length = 6): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789';
  let result = '';
  for (let index = 0; index < length; index += 1) {
    result += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return result;
}

/**
 * Produces a slug that does not collide with existing rows.
 * `exists` is supplied by the caller so this stays storage-agnostic.
 */
export async function uniqueSlug(
  source: string,
  exists: (candidate: string) => Promise<boolean>,
  options: { fallbackPrefix?: string; maxAttempts?: number } = {},
): Promise<string> {
  const { fallbackPrefix = 'item', maxAttempts = 12 } = options;
  const base = slugify(source) || `${fallbackPrefix}-${randomSuffix()}`;

  if (!(await exists(base))) return base;

  for (let attempt = 2; attempt <= maxAttempts; attempt += 1) {
    const candidate = `${base}-${attempt}`.slice(0, 160);
    if (!(await exists(candidate))) return candidate;
  }

  // Sequential suffixes exhausted (heavy contention on a common title): fall
  // back to randomness rather than looping indefinitely.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = `${base}-${randomSuffix()}`.slice(0, 160);
    if (!(await exists(candidate))) return candidate;
  }

  throw new Error(`Unable to generate a unique slug for "${source}"`);
}
