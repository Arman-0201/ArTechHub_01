import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getBootstrap, getSessionUser } from '@/lib/api/queries';
import { CheckoutForm } from '@/components/shop/checkout-form';

export const metadata: Metadata = {
  title: 'Checkout',
  robots: { index: false, follow: false },
};

export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  const [bootstrap, user] = await Promise.all([getBootstrap(locale), getSessionUser()]);
  if (!bootstrap.features.SHOP_ENABLED) notFound();

  return (
    <section className="py-10 sm:py-14">
      <div className="container-page">
        <CheckoutForm
          locale={locale}
          defaultName={user?.name ?? ''}
          defaultEmail={user?.email ?? ''}
        />
      </div>
    </section>
  );
}
