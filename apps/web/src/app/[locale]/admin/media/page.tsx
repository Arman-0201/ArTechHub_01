import type { Metadata } from 'next';
import { MediaClient } from '@/components/admin/media-client';

export const metadata: Metadata = {
  title: 'Media library',
  robots: { index: false, follow: false },
};

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <MediaClient locale={locale} />;
}
