import type { SeoDto, SiteSettingsDto } from '@academy/types';
import { DEFAULT_LOCALE } from '@academy/types';
import { jsonOrJsonNull, prisma } from '../../lib/prisma.js';
import { CACHE_KEYS, platformCache } from '../../lib/cache.js';
import { resolveMediaUrl } from '../media/media.helpers.js';

/**
 * Settings are stored as individual key/value rows rather than a single blob so
 * two admins editing different screens cannot overwrite each other's work.
 */
export const SETTING_KEYS = {
  siteName: 'site.name',
  siteTagline: 'site.tagline',
  siteDescription: 'site.description',
  logoMediaId: 'site.logoMediaId',
  logoDarkMediaId: 'site.logoDarkMediaId',
  faviconMediaId: 'site.faviconMediaId',
  contactEmail: 'contact.email',
  contactPhone: 'contact.phone',
  contactAddress: 'contact.address',
  socialLinks: 'site.socialLinks',
  defaultLocale: 'i18n.defaultLocale',
  maintenanceMode: 'platform.maintenanceMode',
  maintenanceMessage: 'platform.maintenanceMessage',
  footerNote: 'footer.note',
  defaultSeo: 'seo.defaults',
} as const;

const DEFAULT_SEO: SeoDto = {
  title: null,
  description: null,
  keywords: [],
  canonicalUrl: null,
  ogTitle: null,
  ogDescription: null,
  ogImageUrl: null,
  twitterCard: 'summary_large_image',
  robots: 'index, follow',
  structuredData: null,
};

type RawSettings = Record<string, unknown>;

async function readRawSettings(): Promise<RawSettings> {
  const rows = await prisma.setting.findMany();
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

function asString(value: unknown, fallback: string | null = null): string | null {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

async function buildSettings(): Promise<SiteSettingsDto> {
  const [raw, languages] = await Promise.all([
    readRawSettings(),
    prisma.language.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: { code: true, isDefault: true },
    }),
  ]);

  const mediaIds = [
    asString(raw[SETTING_KEYS.logoMediaId]),
    asString(raw[SETTING_KEYS.logoDarkMediaId]),
    asString(raw[SETTING_KEYS.faviconMediaId]),
  ].filter((id): id is string => Boolean(id));

  const mediaById = new Map<string, string>();
  if (mediaIds.length > 0) {
    const media = await prisma.media.findMany({
      where: { id: { in: mediaIds } },
      select: { id: true, url: true, storageKey: true, storageDriver: true },
    });
    for (const item of media) mediaById.set(item.id, resolveMediaUrl(item));
  }

  const defaultFromDb = languages.find((language) => language.isDefault)?.code;

  return {
    siteName: asString(raw[SETTING_KEYS.siteName], 'Academy') ?? 'Academy',
    siteTagline: asString(raw[SETTING_KEYS.siteTagline]),
    siteDescription: asString(raw[SETTING_KEYS.siteDescription]),
    logoUrl: mediaById.get(asString(raw[SETTING_KEYS.logoMediaId]) ?? '') ?? null,
    logoDarkUrl: mediaById.get(asString(raw[SETTING_KEYS.logoDarkMediaId]) ?? '') ?? null,
    faviconUrl: mediaById.get(asString(raw[SETTING_KEYS.faviconMediaId]) ?? '') ?? null,
    contactEmail: asString(raw[SETTING_KEYS.contactEmail]),
    contactPhone: asString(raw[SETTING_KEYS.contactPhone]),
    contactAddress: asString(raw[SETTING_KEYS.contactAddress]),
    socialLinks: Array.isArray(raw[SETTING_KEYS.socialLinks])
      ? (raw[SETTING_KEYS.socialLinks] as { platform: string; url: string }[])
      : [],
    defaultLocale:
      asString(raw[SETTING_KEYS.defaultLocale]) ?? defaultFromDb ?? DEFAULT_LOCALE,
    availableLocales: languages.map((language) => language.code),
    maintenanceMode: asBoolean(raw[SETTING_KEYS.maintenanceMode]),
    maintenanceMessage: asString(raw[SETTING_KEYS.maintenanceMessage]),
    footerNote: asString(raw[SETTING_KEYS.footerNote]),
    defaultSeo: {
      ...DEFAULT_SEO,
      ...((raw[SETTING_KEYS.defaultSeo] as Partial<SeoDto> | undefined) ?? {}),
    },
  };
}

export async function getSettings(): Promise<SiteSettingsDto> {
  return platformCache.remember(CACHE_KEYS.settings, buildSettings, 60_000);
}

/** Raw values for the admin form, before media ids are resolved to URLs. */
export async function getSettingsForAdmin(): Promise<RawSettings & { resolved: SiteSettingsDto }> {
  const [raw, resolved] = await Promise.all([readRawSettings(), getSettings()]);
  return { ...raw, resolved };
}

export async function updateSettings(input: Record<string, unknown>): Promise<SiteSettingsDto> {
  const entries = Object.entries(input).filter(([, value]) => value !== undefined);
  if (entries.length === 0) return getSettings();

  await prisma.$transaction(
    entries.map(([key, value]) =>
      prisma.setting.upsert({
        where: { key },
        create: { key, value: jsonOrJsonNull(value) },
        update: { value: jsonOrJsonNull(value) },
      }),
    ),
  );

  platformCache.invalidate(CACHE_KEYS.settings);
  return getSettings();
}

/** Maps the flat admin payload onto storage keys. */
export function mapSettingsInput(input: Record<string, unknown>): Record<string, unknown> {
  const mapping: Record<string, string> = {
    siteName: SETTING_KEYS.siteName,
    siteTagline: SETTING_KEYS.siteTagline,
    siteDescription: SETTING_KEYS.siteDescription,
    logoMediaId: SETTING_KEYS.logoMediaId,
    logoDarkMediaId: SETTING_KEYS.logoDarkMediaId,
    faviconMediaId: SETTING_KEYS.faviconMediaId,
    contactEmail: SETTING_KEYS.contactEmail,
    contactPhone: SETTING_KEYS.contactPhone,
    contactAddress: SETTING_KEYS.contactAddress,
    socialLinks: SETTING_KEYS.socialLinks,
    defaultLocale: SETTING_KEYS.defaultLocale,
    maintenanceMode: SETTING_KEYS.maintenanceMode,
    maintenanceMessage: SETTING_KEYS.maintenanceMessage,
    footerNote: SETTING_KEYS.footerNote,
    defaultSeo: SETTING_KEYS.defaultSeo,
  };

  const result: Record<string, unknown> = {};
  for (const [field, storageKey] of Object.entries(mapping)) {
    if (field in input) result[storageKey] = input[field] ?? null;
  }
  return result;
}

export async function isMaintenanceMode(): Promise<boolean> {
  const settings = await getSettings();
  return settings.maintenanceMode;
}
