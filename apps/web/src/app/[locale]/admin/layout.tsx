import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/api/queries';
import { localePath } from '@/lib/i18n/config';
import { AdminShell } from '@/components/admin/admin-shell';

/**
 * Admin panel shell.
 *
 * Two independent gates protect this area:
 *   1. this server-side check, which redirects anyone without admin access
 *      before a single byte of the panel renders;
 *   2. the API, which enforces a specific permission on every admin route.
 *
 * The second is the real control. This one exists so a learner who types
 * `/admin` gets sent somewhere sensible instead of a shell full of 403s.
 */
export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const user = await getSessionUser();

  if (!user) {
    redirect(localePath(locale, '/login?redirect=/admin'));
  }
  if (!user.canAccessAdmin) {
    redirect(localePath(locale, '/dashboard'));
  }

  return (
    <AdminShell locale={locale} user={user}>
      {children}
    </AdminShell>
  );
}
