import type { Metadata } from 'next';
import { serverFetch } from '@/lib/api/server';
import type { UserDetailDto } from '@academy/types';
import { PreferencesForm } from '@/components/dashboard/preferences-form';

export const metadata: Metadata = {
  title: 'Settings',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const profile = await serverFetch<UserDetailDto>('/account/profile', { locale });

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary">Settings</h1>
        <p className="text-text-secondary">Language, appearance and what we email you about.</p>
      </header>

      <PreferencesForm currentLocale={profile.locale} />
    </div>
  );
}
