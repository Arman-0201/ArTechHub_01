import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/api/queries';
import { localePath } from '@/lib/i18n/config';
import { DashboardNav } from '@/components/dashboard/dashboard-nav';
import { VerificationBanner } from '@/components/dashboard/verification-banner';

/**
 * Student dashboard shell.
 *
 * The session check happens on the server before anything renders, so an
 * unauthenticated visitor is redirected rather than shown a flash of the
 * dashboard. Every API call underneath re-checks authorisation independently.
 */
export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const user = await getSessionUser();

  if (!user) {
    redirect(localePath(locale, '/login?redirect=/dashboard'));
  }

  return (
    <div className="container-page py-8 lg:py-12">
      <div className="grid gap-8 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <DashboardNav locale={locale} canAccessAdmin={user.canAccessAdmin} />

        <div className="min-w-0 space-y-6">
          {!user.emailVerified ? <VerificationBanner email={user.email} /> : null}
          {children}
        </div>
      </div>
    </div>
  );
}
