import type { Metadata } from 'next';
import { LanguagesClient } from '@/components/admin/languages-client';

export const metadata: Metadata = {
  title: 'Languages',
  robots: { index: false, follow: false },
};

export default function Page() {
  return <LanguagesClient />;
}
