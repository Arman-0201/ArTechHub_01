'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { SiteBootstrapDto } from '@academy/types';
import type { Dictionary } from '@/lib/i18n/dictionaries';
import { createTranslator, type Translator } from '@/lib/i18n/translate';
import { localePath } from '@/lib/i18n/config';

/**
 * Site context.
 *
 * The bootstrap payload (settings, languages, feature flags, navigation) is
 * fetched once on the server and handed down, so no client component has to
 * fetch it and no page renders chrome twice.
 */

interface SiteContextValue {
  locale: string;
  bootstrap: SiteBootstrapDto;
  t: Translator;
  /** Prefixes a path with the active locale. */
  href: (path: string) => string;
  /** Server-enforced too — this is only for hiding links into disabled areas. */
  isFeatureEnabled: (key: string) => boolean;
}

const SiteContext = createContext<SiteContextValue | null>(null);

export function SiteProvider({
  locale,
  bootstrap,
  messages,
  children,
}: {
  locale: string;
  bootstrap: SiteBootstrapDto;
  messages: Dictionary;
  children: ReactNode;
}) {
  const value = useMemo<SiteContextValue>(() => {
    const t = createTranslator(messages);
    return {
      locale,
      bootstrap,
      t,
      href: (path: string) => localePath(locale, path),
      isFeatureEnabled: (key: string) => bootstrap.features[key] === true,
    };
  }, [locale, bootstrap, messages]);

  return <SiteContext.Provider value={value}>{children}</SiteContext.Provider>;
}

export function useSite(): SiteContextValue {
  const context = useContext(SiteContext);
  if (!context) {
    throw new Error('useSite must be used inside a SiteProvider');
  }
  return context;
}

/** Convenience hook for the common case of only needing translation. */
export function useTranslate(): Translator {
  return useSite().t;
}

export function useLocaleHref(): (path: string) => string {
  return useSite().href;
}
