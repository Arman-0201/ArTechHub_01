import type { Metadata } from 'next';
import { ProductsClient } from '@/components/admin/products-client';

export const metadata: Metadata = {
  title: 'Products',
  robots: { index: false, follow: false },
};

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <ProductsClient locale={locale} />;
}
