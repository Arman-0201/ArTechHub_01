import type { Metadata } from 'next';
import { CollectionsClient } from '@/components/admin/collections-client';

export const metadata: Metadata = {
  title: 'Reference collections',
  robots: { index: false, follow: false },
};

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <CollectionsClient locale={locale} />;
}
