import { LOCALES, type LanguageDto } from '@academy/types';
import { prisma } from '../../lib/prisma.js';
import { BadRequestError, NotFoundError } from '../../lib/errors.js';
import { CACHE_KEYS, platformCache } from '../../lib/cache.js';

/**
 * Languages available to the platform are code-defined (`LOCALES`); which of
 * them are *active* is data. Adding a language is therefore an admin toggle,
 * not a deploy — as long as the locale exists in the catalogue.
 */

function toDto(row: {
  code: string;
  name: string;
  nativeName: string;
  direction: string;
  flag: string | null;
  isActive: boolean;
  isDefault: boolean;
  sortOrder: number;
  fallbackCode: string | null;
}): LanguageDto {
  return {
    code: row.code,
    name: row.name,
    nativeName: row.nativeName,
    direction: row.direction === 'rtl' ? 'rtl' : 'ltr',
    flag: row.flag,
    isActive: row.isActive,
    isDefault: row.isDefault,
    sortOrder: row.sortOrder,
    fallbackCode: row.fallbackCode,
  };
}

export async function getActiveLanguages(): Promise<LanguageDto[]> {
  return platformCache.remember(
    CACHE_KEYS.languages,
    async () => {
      const rows = await prisma.language.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      });
      return rows.map(toDto);
    },
    120_000,
  );
}

export async function listAllLanguages(): Promise<LanguageDto[]> {
  const rows = await prisma.language.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });

  // Report translation coverage against the largest catalogue so the admin can
  // see at a glance which languages still need work.
  const counts = await prisma.translation.groupBy({ by: ['locale'], _count: { key: true } });
  const countByLocale = new Map(counts.map((entry) => [entry.locale, entry._count.key]));
  const maxKeys = Math.max(1, ...counts.map((entry) => entry._count.key));

  return rows.map((row) => ({
    ...toDto(row),
    completeness: Math.round(((countByLocale.get(row.code) ?? 0) / maxKeys) * 100),
  }));
}

export async function updateLanguage(
  code: string,
  input: { isActive?: boolean; isDefault?: boolean; sortOrder?: number },
): Promise<LanguageDto> {
  const language = await prisma.language.findUnique({ where: { code } });
  if (!language) throw new NotFoundError('Language');

  // The default language is the fallback for every other locale, so it must
  // stay active and there must always be exactly one.
  if (input.isActive === false && language.isDefault) {
    throw new BadRequestError('The default language cannot be deactivated');
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.language.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
    }
    return tx.language.update({
      where: { code },
      data: {
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        ...(input.isDefault ? { isActive: true } : {}),
      },
    });
  });

  platformCache.invalidate(CACHE_KEYS.languages);
  platformCache.invalidate(CACHE_KEYS.settings);

  return toDto(updated);
}

/* ------------------------------------------------------------- translations */

/**
 * UI string catalogue for one locale, resolved through the fallback chain so a
 * partially translated language still renders completely.
 */
export async function getTranslations(locale: string): Promise<Record<string, string>> {
  return platformCache.remember(
    CACHE_KEYS.translations(locale),
    async () => {
      const language = await prisma.language.findUnique({
        where: { code: locale },
        select: { fallbackCode: true },
      });

      const locales = [locale];
      if (language?.fallbackCode) locales.push(language.fallbackCode);
      if (!locales.includes('en')) locales.push('en');

      const rows = await prisma.translation.findMany({
        where: { locale: { in: locales } },
        select: { locale: true, namespace: true, key: true, value: true },
      });

      // Build from the least specific locale up, so more specific values win.
      const result: Record<string, string> = {};
      for (const candidate of [...locales].reverse()) {
        for (const row of rows) {
          if (row.locale !== candidate) continue;
          result[`${row.namespace}.${row.key}`] = row.value;
        }
      }
      return result;
    },
    120_000,
  );
}

export async function listTranslationsForAdmin(locale: string, namespace?: string) {
  const rows = await prisma.translation.findMany({
    where: { locale, ...(namespace ? { namespace } : {}) },
    orderBy: [{ namespace: 'asc' }, { key: 'asc' }],
    select: { namespace: true, key: true, value: true, updatedAt: true },
  });
  return rows.map((row) => ({ ...row, updatedAt: row.updatedAt.toISOString() }));
}

export async function upsertTranslations(
  locale: string,
  namespace: string,
  entries: Record<string, string>,
): Promise<{ updated: number }> {
  const language = await prisma.language.findUnique({ where: { code: locale }, select: { code: true } });
  if (!language) throw new NotFoundError('Language');

  const pairs = Object.entries(entries);
  if (pairs.length === 0) return { updated: 0 };

  await prisma.$transaction(
    pairs.map(([key, value]) =>
      prisma.translation.upsert({
        where: { locale_namespace_key: { locale, namespace, key } },
        create: { locale, namespace, key, value },
        update: { value },
      }),
    ),
  );

  platformCache.invalidate(CACHE_KEYS.translations(locale));
  return { updated: pairs.length };
}

export async function deleteTranslation(
  locale: string,
  namespace: string,
  key: string,
): Promise<void> {
  await prisma.translation.deleteMany({ where: { locale, namespace, key } });
  platformCache.invalidate(CACHE_KEYS.translations(locale));
}

/** Namespaces present in the catalogue, for the admin language switcher. */
export async function listNamespaces(): Promise<string[]> {
  const rows = await prisma.translation.findMany({
    distinct: ['namespace'],
    select: { namespace: true },
    orderBy: { namespace: 'asc' },
  });
  return rows.map((row) => row.namespace);
}

/** Ensures a row exists for every locale in the code catalogue. */
export async function syncLanguageCatalogue(): Promise<void> {
  for (const [index, locale] of LOCALES.entries()) {
    await prisma.language.upsert({
      where: { code: locale.code },
      create: {
        code: locale.code,
        name: locale.name,
        nativeName: locale.nativeName,
        direction: locale.direction,
        flag: locale.flag,
        isActive: locale.code === 'en',
        isDefault: locale.code === 'en',
        sortOrder: index,
        fallbackCode: locale.fallback ?? null,
      },
      // Metadata is refreshed; the operator's active/default choices are kept.
      update: {
        name: locale.name,
        nativeName: locale.nativeName,
        direction: locale.direction,
        flag: locale.flag,
        fallbackCode: locale.fallback ?? null,
      },
    });
  }
  platformCache.invalidate(CACHE_KEYS.languages);
}
