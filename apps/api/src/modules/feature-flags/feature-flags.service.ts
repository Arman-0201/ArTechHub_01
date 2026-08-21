import { FEATURE_DEFINITIONS, type FeatureFlagDto, type FeatureKey } from '@academy/types';
import { prisma } from '../../lib/prisma.js';
import { CACHE_KEYS, platformCache } from '../../lib/cache.js';
import { NotFoundError } from '../../lib/errors.js';

/**
 * Flag state lives in the database; the *set* of flags is code-defined. A key
 * that is not in `FEATURE_DEFINITIONS` is ignored even if a row exists for it,
 * so a stale row can never silently open a route that no longer expects to be
 * gated.
 */
async function loadFlags(): Promise<Record<string, boolean>> {
  const rows = await prisma.featureFlag.findMany();
  const byKey = new Map(rows.map((row) => [row.key, row.isEnabled]));

  return Object.fromEntries(
    FEATURE_DEFINITIONS.map((definition) => [
      definition.key,
      byKey.get(definition.key) ?? definition.defaultEnabled,
    ]),
  );
}

export async function getFeatureFlags(): Promise<Record<string, boolean>> {
  return platformCache.remember(CACHE_KEYS.features, loadFlags, 60_000);
}

export async function isFeatureEnabled(key: FeatureKey): Promise<boolean> {
  const flags = await getFeatureFlags();
  return flags[key] ?? false;
}

export async function listFeatureFlags(): Promise<FeatureFlagDto[]> {
  const rows = await prisma.featureFlag.findMany();
  const byKey = new Map(rows.map((row) => [row.key, row]));

  return FEATURE_DEFINITIONS.map((definition) => {
    const row = byKey.get(definition.key);
    return {
      key: definition.key,
      label: definition.label,
      description: definition.description,
      isEnabled: row?.isEnabled ?? definition.defaultEnabled,
      updatedAt: (row?.updatedAt ?? new Date()).toISOString(),
    };
  });
}

export async function setFeatureFlag(key: string, isEnabled: boolean): Promise<FeatureFlagDto> {
  const definition = FEATURE_DEFINITIONS.find((entry) => entry.key === key);
  if (!definition) throw new NotFoundError('Feature');

  const row = await prisma.featureFlag.upsert({
    where: { key },
    create: {
      key,
      label: definition.label,
      description: definition.description,
      isEnabled,
    },
    update: { isEnabled },
  });

  platformCache.invalidate(CACHE_KEYS.features);

  return {
    key: row.key,
    label: row.label,
    description: row.description,
    isEnabled: row.isEnabled,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Ensures a row exists for every defined flag; called during seeding. */
export async function syncFeatureDefinitions(): Promise<void> {
  for (const definition of FEATURE_DEFINITIONS) {
    await prisma.featureFlag.upsert({
      where: { key: definition.key },
      create: {
        key: definition.key,
        label: definition.label,
        description: definition.description,
        isEnabled: definition.defaultEnabled,
      },
      // Only metadata is refreshed — an operator's on/off choice is preserved.
      update: { label: definition.label, description: definition.description },
    });
  }
  platformCache.invalidate(CACHE_KEYS.features);
}
