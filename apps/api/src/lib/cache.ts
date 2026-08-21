/**
 * Tiny in-process TTL cache.
 *
 * Used for the handful of values read on virtually every request — settings,
 * feature flags, active languages, navigation. These change rarely and are
 * invalidated explicitly when an admin saves, so a short TTL is a safety net
 * rather than the primary correctness mechanism.
 *
 * Deliberately not Redis: a single value per key, bounded size, and a
 * multi-instance deployment only risks each instance being at most `ttl`
 * behind. Anything that must be strongly consistent reads the database.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class TtlCache {
  private readonly store = new Map<string, CacheEntry<unknown>>();
  private readonly inflight = new Map<string, Promise<unknown>>();

  constructor(private readonly defaultTtlMs = 30_000) {}

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlMs = this.defaultTtlMs): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  /**
   * Read-through with single-flight: concurrent misses for the same key share
   * one loader call instead of stampeding the database.
   */
  async remember<T>(key: string, loader: () => Promise<T>, ttlMs = this.defaultTtlMs): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== undefined) return cached;

    const pending = this.inflight.get(key) as Promise<T> | undefined;
    if (pending) return pending;

    const promise = loader()
      .then((value) => {
        this.set(key, value, ttlMs);
        return value;
      })
      .finally(() => {
        this.inflight.delete(key);
      });

    this.inflight.set(key, promise);
    return promise;
  }

  invalidate(key: string): void {
    this.store.delete(key);
  }

  /** Drops every key beginning with `prefix` — used after bulk admin edits. */
  invalidatePrefix(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }

  clear(): void {
    this.store.clear();
  }
}

/** Shared cache for platform-wide configuration. */
export const platformCache = new TtlCache(30_000);

export const CACHE_KEYS = {
  settings: 'settings',
  features: 'features',
  languages: 'languages',
  menu: (slug: string) => `menu:${slug}`,
  footer: 'footer',
  translations: (locale: string) => `translations:${locale}`,
  legalLinks: 'legal:links',
} as const;
