'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, CheckCircle2, LayoutDashboard, Settings, Shield, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { localePath } from '@/lib/i18n/config';

/**
 * Dashboard side navigation.
 *
 * A horizontally scrolling tab strip on small screens and a sidebar from `lg`
 * up — the same markup and the same tab order in both, so keyboard and screen
 * reader behaviour does not change with viewport width.
 */
export function DashboardNav({
  locale,
  canAccessAdmin,
}: {
  locale: string;
  canAccessAdmin: boolean;
}) {
  const pathname = usePathname();

  const items = [
    { href: '/dashboard', label: 'Overview', Icon: LayoutDashboard, exact: true },
    { href: '/dashboard/courses', label: 'My courses', Icon: BookOpen },
    { href: '/dashboard/completed', label: 'Completed', Icon: CheckCircle2 },
    { href: '/dashboard/profile', label: 'Profile', Icon: User },
    { href: '/dashboard/settings', label: 'Settings', Icon: Settings },
  ];

  return (
    <nav aria-label="Dashboard" className="lg:sticky lg:top-24 lg:self-start">
      <ul className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-2 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0">
        {items.map(({ href, label, Icon, exact }) => {
          const target = localePath(locale, href);
          const isActive = exact ? pathname === target : pathname.startsWith(target);

          return (
            <li key={href} className="shrink-0 lg:shrink">
              <Link
                href={target}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2.5 whitespace-nowrap rounded-lg px-3.5 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary-soft text-primary'
                    : 'text-text-secondary hover:bg-surface-sunken hover:text-text-primary',
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                {label}
              </Link>
            </li>
          );
        })}

        {canAccessAdmin ? (
          <li className="shrink-0 lg:mt-3 lg:shrink lg:border-t lg:border-border lg:pt-3">
            <Link
              href={localePath(locale, '/admin')}
              className="flex items-center gap-2.5 whitespace-nowrap rounded-lg px-3.5 py-2.5 text-sm font-medium text-primary transition-colors hover:bg-primary-soft"
            >
              <Shield className="size-4 shrink-0" aria-hidden="true" />
              Admin panel
            </Link>
          </li>
        ) : null}
      </ul>
    </nav>
  );
}
