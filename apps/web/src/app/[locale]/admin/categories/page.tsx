import type { Metadata } from 'next';
import { CategoriesClient } from '@/components/admin/categories-client';

export const metadata: Metadata = {
  title: 'Categories',
  robots: { index: false, follow: false },
};

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <CategoriesClient locale={locale} />;
}
