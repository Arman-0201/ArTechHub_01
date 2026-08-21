import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Package } from 'lucide-react';
import { getBootstrap, getProduct } from '@/lib/api/queries';
import { buildPageMetadata } from '@/lib/seo';
import { localePath } from '@/lib/i18n/config';
import { formatPrice } from '@/lib/utils';
import { Badge, Breadcrumbs } from '@/components/ui';
import { RichText } from '@/components/content/rich-text';
import { AddToCartButton } from '@/components/shop/add-to-cart-button';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const product = await getProduct(slug, locale);
  if (!product) return { title: 'Product not found' };

  return buildPageMetadata({
    seo: product.seo,
    locale,
    path: `/shop/${product.slug}`,
    fallbackTitle: product.name,
    fallbackDescription: product.summary ?? undefined,
    imageUrl: product.images[0]?.url ?? null,
  });
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;

  const bootstrap = await getBootstrap(locale);
  if (!bootstrap.features.SHOP_ENABLED) notFound();

  const product = await getProduct(slug, locale);
  if (!product) notFound();

  const isOutOfStock = product.stock !== null && product.stock <= 0;

  return (
    <section className="py-10 sm:py-14">
      <div className="container-page">
        <Breadcrumbs
          items={[
            { label: 'Home', href: localePath(locale, '/') },
            { label: 'Shop', href: localePath(locale, '/shop') },
            { label: product.name },
          ]}
          className="mb-8"
        />

        <div className="grid gap-10 lg:grid-cols-2">
          <div className="overflow-hidden rounded-2xl border border-border bg-surface-sunken">
            {product.images[0] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={product.images[0].url}
                alt={product.images[0].alt ?? ''}
                className="aspect-square w-full object-cover"
              />
            ) : (
              <div className="grid aspect-square place-items-center" aria-hidden="true">
                <Package className="size-16 text-text-muted" />
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Badge tone="neutral">{product.type.toLowerCase()}</Badge>
                {isOutOfStock ? <Badge tone="danger">Out of stock</Badge> : null}
              </div>

              <h1 className="text-3xl font-semibold tracking-tight text-text-primary sm:text-4xl">
                {product.name}
              </h1>

              {product.summary ? (
                <p className="text-lg leading-relaxed text-text-secondary">{product.summary}</p>
              ) : null}
            </div>

            <div className="flex items-baseline gap-3">
              <span className="text-3xl font-semibold text-text-primary">
                {formatPrice(product.priceCents, product.currency, locale)}
              </span>
              {product.compareAtPriceCents &&
              product.compareAtPriceCents > product.priceCents ? (
                <span className="text-lg text-text-muted line-through">
                  {formatPrice(product.compareAtPriceCents, product.currency, locale)}
                </span>
              ) : null}
            </div>

            <AddToCartButton
              productId={product.id}
              locale={locale}
              disabled={isOutOfStock}
              maxQuantity={product.stock ?? 99}
            />

            {product.stock !== null && product.stock > 0 && product.stock <= 5 ? (
              <p className="text-sm text-warning">Only {product.stock} left in stock.</p>
            ) : null}

            {product.description ? (
              <div className="border-t border-border pt-6">
                <RichText document={product.description} className="text-base" />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
