'use client';

import { useEffect, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme, useTranslate } from '@/components/providers';
import type { ThemePreference } from '@/components/providers/theme-provider';

const ORDER: ThemePreference[] = ['system', 'light', 'dark'];

const ICONS: Record<ThemePreference, typeof Sun> = {
  system: Monitor,
  light: Sun,
  dark: Moon,
};

/**
 * Cycles system -> light -> dark.
 *
 * A three-state toggle rather than a binary switch, because "follow the system"
 * is a real preference and losing it would strand anyone using scheduled dark
 * mode on whichever theme they last picked.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const t = useTranslate();
  const [isMounted, setIsMounted] = useState(false);

  // The stored preference is unknown during SSR; rendering a fixed placeholder
  // avoids a hydration mismatch on the icon.
  useEffect(() => setIsMounted(true), []);

  const Icon = ICONS[theme];
  const label = `${t('theme.switch')} (${t(`theme.${theme}`)})`;

  return (
    <button
      type="button"
      onClick={() => {
        const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length]!;
        setTheme(next);
      }}
      className={cn(
        'grid size-10 place-items-center rounded-lg text-text-secondary transition-colors',
        'hover:bg-surface-sunken hover:text-text-primary',
      )}
      aria-label={label}
      title={label}
    >
      {isMounted ? (
        <Icon className="size-4.5" aria-hidden="true" />
      ) : (
        <Monitor className="size-4.5 opacity-0" aria-hidden="true" />
      )}
    </button>
  );
}
