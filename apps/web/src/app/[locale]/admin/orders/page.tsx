import type { Metadata } from 'next';
import { OrdersClient } from '@/components/admin/orders-client';

export const metadata: Metadata = {
  title: 'Orders',
  robots: { index: false, follow: false },
};

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <OrdersClient locale={locale} />;
}
