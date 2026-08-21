import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getBootstrap } from '@/lib/api/queries';
import { CartView } from '@/components/shop/cart-view';

export const metadata: Metadata = {
  title: 'Cart',
  robots: { index: false, follow: false },
};

export default async function CartPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;

  const bootstrap = await getBootstrap(locale);
  if (!bootstrap.features.SHOP_ENABLED) notFound();

  return (
    <section className="py-10 sm:py-14">
      <div className="container-page">
        <CartView locale={locale} />
      </div>
    </section>
  );
}
