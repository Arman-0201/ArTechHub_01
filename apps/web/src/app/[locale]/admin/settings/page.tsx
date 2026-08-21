import type { Metadata } from 'next';
import { SettingsClient } from '@/components/admin/settings-client';

export const metadata: Metadata = {
  title: 'Settings',
  robots: { index: false, follow: false },
};

export default function Page() {
  return <SettingsClient />;
}
