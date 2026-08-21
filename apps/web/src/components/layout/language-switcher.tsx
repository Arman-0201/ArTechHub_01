'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Check, Globe } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSite } from '@/components/providers';
import { LOCALE_COOKIE, swapLocaleInPath } from '@/lib/i18n/config';

/**
 * Language switcher.
 *
 * Only languages an administrator has activated are listed — the full locale
 * catalogue is not offered, because selecting an inactive language would land
 * on an untranslated page. Switching preserves the current path, so a learner
 * reading lesson 4 stays on lesson 4.
 */
export function LanguageSwitcher() {
  const { bootstrap, locale, t } = useSite();
  const router = useRouter();
  const pathname = usePathname();

  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const languages = bootstrap.languages;
  const active = languages.find((language) => language.code === locale) ?? languages[0];

  useEffect(() => {
    if (!isOpen) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    // Escape must close the menu and is the expected keyboard affordance.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  if (languages.length <= 1) return null;

  function selectLanguage(code: string) {
    setIsOpen(false);
    if (code === locale) return;

    // Remember the choice so a later visit to `/` resolves here directly.
    document.cookie = `${LOCALE_COOKIE}=${code}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    router.push(swapLocaleInPath(pathname, code));
    router.refresh();
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((previous) => !previous)}
        className="flex h-10 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-sunken hover:text-text-primary"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={t('language.switch')}
      >
        <Globe className="size-4" aria-hidden="true" />
        <span className="hidden uppercase sm:inline">{active?.code ?? locale}</span>
      </button>

      {isOpen ? (
        <div
          role="listbox"
          aria-label={t('language.switch')}
          className="absolute right-0 top-full z-50 mt-2 min-w-52 animate-[fade-up_0.18s_ease-out] overflow-hidden rounded-xl border border-border bg-surface-raised p-1.5 shadow-overlay"
        >
          {languages.map((language) => {
            const isActive = language.code === locale;
            return (
              <button
                key={language.code}
                type="button"
                role="option"
                aria-selected={isActive}
                onClick={() => selectLanguage(language.code)}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                  isActive
                    ? 'bg-primary-soft font-medium text-primary'
                    : 'text-text-secondary hover:bg-surface-sunken hover:text-text-primary',
                )}
              >
                {language.flag ? (
                  <span aria-hidden="true" className="text-base leading-none">
                    {language.flag}
                  </span>
                ) : null}
                <span className="flex-1">{language.nativeName}</span>
                {isActive ? <Check className="size-3.5" aria-hidden="true" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
