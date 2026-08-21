import type { Metadata } from 'next';
import { SeoClient } from '@/components/admin/seo-client';

export const metadata: Metadata = {
  title: 'SEO',
  robots: { index: false, follow: false },
};

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <SeoClient locale={locale} />;
}
