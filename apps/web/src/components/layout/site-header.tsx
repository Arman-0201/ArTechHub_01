'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, GraduationCap, Menu, Search, X } from 'lucide-react';
import type { MenuItemDto } from '@academy/types';
import { cn } from '@/lib/utils';
import { useAuth, useSite } from '@/components/providers';
import { Button } from '@/components/ui';
import { LanguageSwitcher } from './language-switcher';
import { ThemeToggle } from './theme-toggle';
import { UserMenu } from './user-menu';
import { SearchDialog } from './search-dialog';

/**
 * Site header.
 *
 * Navigation is entirely data-driven: the items come from the API, already
 * filtered by locale and by the viewer's roles. Nothing here is hardcoded, so
 * an administrator can restructure the menu without a deploy — and a staff-only
 * item is absent from the payload for anonymous visitors rather than merely
 * hidden with CSS.
 */

function DesktopNavItem({ item }: { item: MenuItemDto }) {
  const [isOpen, setIsOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasChildren = item.children.length > 0;

  // A short close delay keeps the submenu open while the pointer crosses the
  // gap between trigger and panel.
  const open = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setIsOpen(true);
  };
  const scheduleClose = () => {
    closeTimer.current = setTimeout(() => setIsOpen(false), 120);
  };

  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [],
  );

  if (!hasChildren) {
    return (
      <Link
        href={item.url}
        target={item.target}
        {...(item.target === '_blank' ? { rel: 'noopener noreferrer' } : {})}
        className="rounded-md px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:text-primary"
      >
        {item.label}
      </Link>
    );
  }

  return (
    <div className="relative" onMouseEnter={open} onMouseLeave={scheduleClose}>
      <button
        type="button"
        className="flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:text-primary"
        aria-expanded={isOpen}
        aria-haspopup="true"
        onClick={() => setIsOpen((previous) => !previous)}
      >
        {item.label}
        <ChevronDown
          className={cn('size-3.5 transition-transform duration-200', isOpen && 'rotate-180')}
          aria-hidden="true"
        />
      </button>

      {isOpen ? (
        <div
          className="absolute left-0 top-full z-50 min-w-60 animate-[fade-up_0.18s_ease-out] pt-2"
          onMouseEnter={open}
          onMouseLeave={scheduleClose}
        >
          <ul className="overflow-hidden rounded-xl border border-border bg-surface-raised p-1.5 shadow-overlay">
            {item.children.map((child) => (
              <li key={child.id}>
                <Link
                  href={child.url}
                  target={child.target}
                  {...(child.target === '_blank' ? { rel: 'noopener noreferrer' } : {})}
                  className="block rounded-lg px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-primary-soft hover:text-primary"
                  onClick={() => setIsOpen(false)}
                >
                  {child.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function MobileNavItem({ item, onNavigate }: { item: MenuItemDto; onNavigate: () => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const hasChildren = item.children.length > 0;

  if (!hasChildren) {
    return (
      <li>
        <Link
          href={item.url}
          onClick={onNavigate}
          className="block rounded-lg px-3 py-2.5 text-base font-medium text-text-primary transition-colors hover:bg-surface-sunken"
        >
          {item.label}
        </Link>
      </li>
    );
  }

  return (
    <li>
      <button
        type="button"
        onClick={() => setIsOpen((previous) => !previous)}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-base font-medium text-text-primary transition-colors hover:bg-surface-sunken"
      >
        {item.label}
        <ChevronDown
          className={cn('size-4 transition-transform duration-200', isOpen && 'rotate-180')}
          aria-hidden="true"
        />
      </button>
      {isOpen ? (
        <ul className="ml-3 mt-1 space-y-0.5 border-l border-border pl-3">
          {item.children.map((child) => (
            <li key={child.id}>
              <Link
                href={child.url}
                onClick={onNavigate}
                className="block rounded-lg px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-surface-sunken hover:text-primary"
              >
                {child.label}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function SiteHeader() {
  const { bootstrap, t, href, isFeatureEnabled } = useSite();
  const { user, status } = useAuth();
  const pathname = usePathname();

  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  // Route changes must not leave the mobile drawer open behind the new page.
  useEffect(() => {
    setIsMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Prevent the page behind the drawer from scrolling.
  useEffect(() => {
    document.body.style.overflow = isMobileOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobileOpen]);

  const items = bootstrap.menus.header?.items ?? [];
  const { settings } = bootstrap;

  return (
    <>
      <header
        className={cn(
          'sticky top-0 z-40 border-b transition-[background-color,border-color,box-shadow] duration-200',
          isScrolled
            ? 'border-border bg-background/85 shadow-subtle backdrop-blur-md'
            : 'border-transparent bg-background',
        )}
        style={{ height: 'var(--header-height)' }}
      >
        <div className="container-page flex h-full items-center gap-2">
          <Link
            href={href('/')}
            className="flex shrink-0 items-center gap-2.5 rounded-md font-semibold text-text-primary"
          >
            {settings.logoUrl ? (
              // Logos are administrator-uploaded and arbitrary in size, so this
              // stays a plain img with an explicit height cap.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={settings.logoUrl} alt={settings.siteName} className="h-8 w-auto" />
            ) : (
              <>
                <span className="grid size-9 place-items-center rounded-lg bg-primary text-text-on-primary">
                  <GraduationCap className="size-5" aria-hidden="true" />
                </span>
                <span className="text-[0.9375rem] tracking-tight">{settings.siteName}</span>
              </>
            )}
          </Link>

          <nav aria-label="Main" className="ml-4 hidden lg:flex lg:items-center lg:gap-0.5">
            {items.map((item) => (
              <DesktopNavItem key={item.id} item={item} />
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1.5">
            {isFeatureEnabled('SEARCH_ENABLED') ? (
              <button
                type="button"
                onClick={() => setIsSearchOpen(true)}
                className="grid size-10 place-items-center rounded-lg text-text-secondary transition-colors hover:bg-surface-sunken hover:text-text-primary"
                aria-label={t('action.search')}
              >
                <Search className="size-4.5" aria-hidden="true" />
              </button>
            ) : null}

            <LanguageSwitcher />
            <ThemeToggle />

            {status === 'authenticated' && user ? (
              <UserMenu user={user} />
            ) : status === 'loading' ? (
              <div className="hidden h-10 w-32 animate-pulse rounded-lg bg-surface-sunken sm:block" />
            ) : (
              <div className="hidden items-center gap-2 sm:flex">
                <Button href={href('/login')} variant="ghost" size="sm">
                  {t('action.signIn')}
                </Button>
                {isFeatureEnabled('REGISTRATION_ENABLED') ? (
                  <Button href={href('/register')} size="sm">
                    {t('action.getStarted')}
                  </Button>
                ) : null}
              </div>
            )}

            <button
              type="button"
              onClick={() => setIsMobileOpen((previous) => !previous)}
              className="grid size-10 place-items-center rounded-lg text-text-secondary transition-colors hover:bg-surface-sunken lg:hidden"
              aria-expanded={isMobileOpen}
              aria-controls="mobile-navigation"
              aria-label={isMobileOpen ? t('nav.closeMenu') : t('nav.menu')}
            >
              {isMobileOpen ? (
                <X className="size-5" aria-hidden="true" />
              ) : (
                <Menu className="size-5" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </header>

      {isMobileOpen ? (
        <div
          id="mobile-navigation"
          className="fixed inset-x-0 bottom-0 z-30 overflow-y-auto border-t border-border bg-background p-4 lg:hidden"
          style={{ top: 'var(--header-height)' }}
        >
          <nav aria-label="Mobile">
            <ul className="space-y-0.5">
              {items.map((item) => (
                <MobileNavItem key={item.id} item={item} onNavigate={() => setIsMobileOpen(false)} />
              ))}
            </ul>
          </nav>

          {status !== 'authenticated' ? (
            <div className="mt-5 flex flex-col gap-2 border-t border-border pt-5">
              <Button href={href('/login')} variant="outline" fullWidth>
                {t('action.signIn')}
              </Button>
              {isFeatureEnabled('REGISTRATION_ENABLED') ? (
                <Button href={href('/register')} fullWidth>
                  {t('action.getStarted')}
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <SearchDialog open={isSearchOpen} onClose={() => setIsSearchOpen(false)} />
    </>
  );
}
