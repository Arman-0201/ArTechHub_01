'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BookOpen, LayoutDashboard, LogOut, Settings, Shield, User } from 'lucide-react';
import type { SessionUserDto } from '@academy/types';
import { cn, initialsOf, colorFromString } from '@/lib/utils';
import { useAuth, useSite } from '@/components/providers';

/**
 * Account menu.
 *
 * The admin entry appears only when the session says the account can reach the
 * admin panel. That is a convenience: `/admin` is protected server-side, and a
 * user who forces the URL gets a 403 from the API regardless of this menu.
 */
export function UserMenu({ user }: { user: SessionUserDto }) {
  const { t, href } = useSite();
  const { signOut } = useAuth();
  const router = useRouter();

  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
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

  const links = [
    { href: href('/dashboard'), label: t('dashboard.overview'), Icon: LayoutDashboard },
    { href: href('/dashboard/courses'), label: t('dashboard.myCourses'), Icon: BookOpen },
    { href: href('/dashboard/profile'), label: t('dashboard.profile'), Icon: User },
    { href: href('/dashboard/settings'), label: t('dashboard.settings'), Icon: Settings },
  ];

  async function handleSignOut() {
    setIsOpen(false);
    await signOut();
    router.push(href('/'));
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((previous) => !previous)}
        className="flex items-center gap-2 rounded-lg p-1 transition-colors hover:bg-surface-sunken"
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label={user.name}
      >
        {user.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.avatarUrl}
            alt=""
            className="size-8 rounded-full object-cover"
            width={32}
            height={32}
          />
        ) : (
          <span
            className="grid size-8 place-items-center rounded-full text-xs font-semibold text-white"
            style={{ backgroundColor: colorFromString(user.id) }}
            aria-hidden="true"
          >
            {initialsOf(user.name)}
          </span>
        )}
      </button>

      {isOpen ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-64 animate-[fade-up_0.18s_ease-out] overflow-hidden rounded-xl border border-border bg-surface-raised shadow-overlay"
        >
          <div className="border-b border-border px-4 py-3">
            <p className="truncate text-sm font-semibold text-text-primary">{user.name}</p>
            <p className="truncate text-xs text-text-muted">{user.email}</p>
            {!user.emailVerified ? (
              <p className="mt-1.5 inline-flex rounded-full bg-warning-soft px-2 py-0.5 text-2xs font-medium text-warning">
                Email not verified
              </p>
            ) : null}
          </div>

          <div className="p-1.5">
            {links.map(({ href: linkHref, label, Icon }) => (
              <Link
                key={linkHref}
                href={linkHref}
                role="menuitem"
                onClick={() => setIsOpen(false)}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-surface-sunken hover:text-text-primary"
              >
                <Icon className="size-4" aria-hidden="true" />
                {label}
              </Link>
            ))}

            {user.canAccessAdmin ? (
              <Link
                href={href('/admin')}
                role="menuitem"
                onClick={() => setIsOpen(false)}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary-soft"
              >
                <Shield className="size-4" aria-hidden="true" />
                {t('nav.admin')}
              </Link>
            ) : null}
          </div>

          <div className="border-t border-border p-1.5">
            <button
              type="button"
              role="menuitem"
              onClick={handleSignOut}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-text-secondary',
                'transition-colors hover:bg-danger-soft hover:text-danger',
              )}
            >
              <LogOut className="size-4" aria-hidden="true" />
              {t('action.signOut')}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
