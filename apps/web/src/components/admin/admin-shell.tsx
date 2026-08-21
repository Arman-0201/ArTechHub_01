'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ArrowLeft,
  BookOpen,
  ClipboardList,
  FileText,
  FolderTree,
  Image as ImageIcon,
  Languages,
  LayoutDashboard,
  Menu as MenuIcon,
  Newspaper,
  Package,
  ScrollText,
  Search as SearchIcon,
  Settings,
  ShieldCheck,
  ShoppingCart,
  ToggleLeft,
  Users,
  X,
} from 'lucide-react';
import { PERMISSIONS, type Permission, type SessionUserDto } from '@academy/types';
import { cn } from '@/lib/utils';
import { localePath } from '@/lib/i18n/config';

/**
 * Admin navigation.
 *
 * Every entry declares the permission it requires, and entries the signed-in
 * user cannot use are not rendered. That is a usability decision — the API
 * refuses the underlying request regardless — but it keeps the panel honest:
 * a Content Manager never sees a Users link that would only ever 403.
 */
interface NavEntry {
  href: string;
  label: string;
  Icon: typeof LayoutDashboard;
  permission?: Permission;
  exact?: boolean;
}

interface NavGroup {
  title: string;
  entries: NavEntry[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Overview',
    entries: [
      {
        href: '/admin',
        label: 'Dashboard',
        Icon: LayoutDashboard,
        permission: PERMISSIONS.ANALYTICS_READ,
        exact: true,
      },
    ],
  },
  {
    title: 'Learning',
    entries: [
      { href: '/admin/courses', label: 'Courses', Icon: BookOpen, permission: PERMISSIONS.COURSES_READ },
      {
        href: '/admin/categories',
        label: 'Categories',
        Icon: FolderTree,
        permission: PERMISSIONS.CATEGORIES_READ,
      },
      {
        href: '/admin/instructors',
        label: 'Instructors',
        Icon: Users,
        permission: PERMISSIONS.COURSES_READ,
      },
      {
        href: '/admin/enrollments',
        label: 'Enrollments',
        Icon: ClipboardList,
        permission: PERMISSIONS.ENROLLMENTS_READ,
      },
    ],
  },
  {
    title: 'Content',
    entries: [
      { href: '/admin/pages', label: 'Pages', Icon: FileText, permission: PERMISSIONS.PAGES_READ },
      { href: '/admin/menus', label: 'Navigation', Icon: MenuIcon, permission: PERMISSIONS.MENUS_MANAGE },
      { href: '/admin/blog', label: 'Articles', Icon: Newspaper, permission: PERMISSIONS.BLOG_READ },
      { href: '/admin/media', label: 'Media', Icon: ImageIcon, permission: PERMISSIONS.MEDIA_READ },
      { href: '/admin/legal', label: 'Legal', Icon: ScrollText, permission: PERMISSIONS.LEGAL_MANAGE },
    ],
  },
  {
    title: 'Commerce',
    entries: [
      {
        href: '/admin/products',
        label: 'Products',
        Icon: Package,
        permission: PERMISSIONS.PRODUCTS_READ,
      },
      {
        href: '/admin/orders',
        label: 'Orders',
        Icon: ShoppingCart,
        permission: PERMISSIONS.ORDERS_READ,
      },
    ],
  },
  {
    title: 'Platform',
    entries: [
      { href: '/admin/users', label: 'Users', Icon: Users, permission: PERMISSIONS.USERS_READ },
      { href: '/admin/roles', label: 'Roles', Icon: ShieldCheck, permission: PERMISSIONS.ROLES_READ },
      {
        href: '/admin/languages',
        label: 'Languages',
        Icon: Languages,
        permission: PERMISSIONS.LANGUAGES_MANAGE,
      },
      { href: '/admin/seo', label: 'SEO', Icon: SearchIcon, permission: PERMISSIONS.SEO_MANAGE },
      {
        href: '/admin/features',
        label: 'Features',
        Icon: ToggleLeft,
        permission: PERMISSIONS.FEATURES_MANAGE,
      },
      {
        href: '/admin/settings',
        label: 'Settings',
        Icon: Settings,
        permission: PERMISSIONS.SETTINGS_MANAGE,
      },
      {
        href: '/admin/audit-logs',
        label: 'Audit log',
        Icon: ClipboardList,
        permission: PERMISSIONS.AUDIT_READ,
      },
    ],
  },
];

export function AdminShell({
  locale,
  user,
  children,
}: {
  locale: string;
  user: SessionUserDto;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  const can = (permission?: Permission) =>
    !permission || user.isSuperAdmin || user.permissions.includes(permission);

  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    entries: group.entries.filter((entry) => can(entry.permission)),
  })).filter((group) => group.entries.length > 0);

  return (
    <div className="flex min-h-[calc(100dvh-var(--header-height))]">
      {isOpen ? (
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="fixed inset-0 z-30 bg-[var(--color-overlay)] lg:hidden"
          aria-hidden="true"
          tabIndex={-1}
        />
      ) : null}

      <aside
        className={cn(
          'z-40 w-64 shrink-0 border-r border-border bg-surface',
          'fixed inset-y-0 left-0 overflow-y-auto transition-transform duration-300 ease-out-quart',
          'lg:sticky lg:top-[var(--header-height)] lg:h-[calc(100dvh-var(--header-height))] lg:translate-x-0',
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
        aria-label="Admin navigation"
      >
        <div className="flex items-center justify-between border-b border-border p-4">
          <p className="text-sm font-semibold text-text-primary">Admin panel</p>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="grid size-8 place-items-center rounded-md text-text-muted hover:bg-surface-sunken lg:hidden"
            aria-label="Close navigation"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        <nav className="space-y-5 p-3">
          {groups.map((group) => (
            <div key={group.title}>
              <p className="px-3 pb-1.5 text-2xs font-semibold uppercase tracking-wider text-text-muted">
                {group.title}
              </p>
              <ul className="space-y-0.5">
                {group.entries.map(({ href, label, Icon, exact }) => {
                  const target = localePath(locale, href);
                  const isActive = exact ? pathname === target : pathname.startsWith(target);

                  return (
                    <li key={href}>
                      <Link
                        href={target}
                        aria-current={isActive ? 'page' : undefined}
                        className={cn(
                          'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
                          isActive
                            ? 'bg-primary-soft font-medium text-primary'
                            : 'text-text-secondary hover:bg-surface-sunken hover:text-text-primary',
                        )}
                      >
                        <Icon className="size-4 shrink-0" aria-hidden="true" />
                        {label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-border p-3">
          <Link
            href={localePath(locale, '/')}
            className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-surface-sunken hover:text-text-primary"
          >
            <ArrowLeft className="size-4 shrink-0" aria-hidden="true" />
            Back to site
          </Link>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <div className="sticky top-[var(--header-height)] z-20 flex items-center gap-3 border-b border-border bg-background/90 px-4 py-2.5 backdrop-blur-sm lg:hidden">
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className="grid size-9 place-items-center rounded-lg text-text-secondary hover:bg-surface-sunken"
            aria-label="Open navigation"
            aria-expanded={isOpen}
          >
            <MenuIcon className="size-4.5" aria-hidden="true" />
          </button>
          <span className="text-sm font-medium text-text-primary">Admin panel</span>
        </div>

        <div className="p-4 sm:p-6 lg:p-8">{children}</div>
      </div>
    </div>
  );
}
