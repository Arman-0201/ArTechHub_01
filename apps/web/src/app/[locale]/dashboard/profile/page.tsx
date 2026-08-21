import type { Metadata } from 'next';
import { getSessionUser } from '@/lib/api/queries';
import { serverFetch } from '@/lib/api/server';
import type { UserDetailDto } from '@academy/types';
import { ProfileForm } from '@/components/dashboard/profile-form';
import { ChangePasswordForm } from '@/components/dashboard/change-password-form';
import { SessionsPanel } from '@/components/dashboard/sessions-panel';

export const metadata: Metadata = {
  title: 'Profile',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function ProfilePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;

  const [user, profile] = await Promise.all([
    getSessionUser(),
    serverFetch<UserDetailDto>('/account/profile', { locale }),
  ]);

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary">Profile</h1>
        <p className="text-text-secondary">
          Your public details and the credentials you sign in with.
        </p>
      </header>

      <ProfileForm profile={profile} />

      {/* Accounts created through an OAuth provider have no password to change
          until they set one, so the form is only offered where it applies. */}
      {profile.authProviders.length === 0 ? <ChangePasswordForm locale={locale} /> : null}

      <SessionsPanel />

      {user ? (
        <section className="rounded-xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold text-text-primary">Account</h2>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-text-muted">Email</dt>
              <dd className="text-text-primary">{profile.email}</dd>
            </div>
            <div>
              <dt className="text-text-muted">Status</dt>
              <dd className="text-text-primary">
                {profile.emailVerified ? 'Verified' : 'Awaiting verification'}
              </dd>
            </div>
            <div>
              <dt className="text-text-muted">Roles</dt>
              <dd className="text-text-primary">
                {profile.roles.map((role) => role.name).join(', ') || 'Student'}
              </dd>
            </div>
            <div>
              <dt className="text-text-muted">Member since</dt>
              <dd className="text-text-primary">
                {new Date(profile.createdAt).toLocaleDateString(locale, {
                  year: 'numeric',
                  month: 'long',
                })}
              </dd>
            </div>
            {profile.authProviders.length > 0 ? (
              <div className="sm:col-span-2">
                <dt className="text-text-muted">Connected sign-in</dt>
                <dd className="text-text-primary">
                  {profile.authProviders
                    .map((provider) => provider.provider.replace(/^\w/, (c) => c.toUpperCase()))
                    .join(', ')}
                </dd>
              </div>
            ) : null}
          </dl>
        </section>
      ) : null}
    </div>
  );
}
