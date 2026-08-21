import type { Metadata } from 'next';
import { PagesClient } from '@/components/admin/pages-client';

export const metadata: Metadata = {
  title: 'Pages',
  robots: { index: false, follow: false },
};

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <PagesClient locale={locale} />;
}
