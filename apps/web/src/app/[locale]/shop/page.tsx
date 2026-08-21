import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Package } from 'lucide-react';
import { getBootstrap, getProducts } from '@/lib/api/queries';
import { buildPageMetadata } from '@/lib/seo';
import { localePath } from '@/lib/i18n/config';
import { formatPrice } from '@/lib/utils';
import { Badge, EmptyState } from '@/components/ui';
import { Pagination } from '@/components/ui/pagination';
import { CartButton } from '@/components/shop/cart-button';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildPageMetadata({
    seo: null,
    locale,
    path: '/shop',
    fallbackTitle: 'Shop',
    fallbackDescription: 'Books, workbooks and learning materials.',
  });
}

export default async function ShopPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string; category?: string }>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);

  // The shop is off by default; the API refuses these calls too.
  const bootstrap = await getBootstrap(locale);
  if (!bootstrap.features.SHOP_ENABLED) notFound();

  const page = Math.max(1, Number.parseInt(query.page ?? '1', 10) || 1);
  const { items, meta } = await getProducts(locale, {
    page,
    pageSize: 12,
    category: query.category,
  });

  return (
    <>
      <section className="border-b border-border bg-background-subtle py-12 sm:py-16">
        <div className="container-page flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Shop</p>
            <h1 className="text-3xl font-semibold tracking-tight text-text-primary sm:text-4xl">
              Learning materials
            </h1>
            <p className="text-lg leading-relaxed text-text-secondary">
              Workbooks, e-books and printed material that accompany the courses.
            </p>
          </div>
          <CartButton locale={locale} />
        </div>
      </section>

      <section className="py-12 sm:py-16">
        <div className="container-page space-y-8">
          {items.length === 0 ? (
            <EmptyState
              icon={<Package className="size-8" />}
              title="Nothing in the shop yet."
              description="Products appear here once they are published."
            />
          ) : (
            <>
              <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {items.map((product) => (
                  <li key={product.id}>
                    <article className="group relative flex h-full flex-col overflow-hidden rounded-xl border border-border bg-surface transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-accent">
                      <div className="aspect-square overflow-hidden bg-surface-sunken">
                        {product.images[0] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={product.images[0].url}
                            alt={product.images[0].alt ?? ''}
                            className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                            loading="lazy"
                          />
                        ) : (
                          <span className="grid size-full place-items-center" aria-hidden="true">
                            <Package className="size-10 text-text-muted" />
                          </span>
                        )}
                      </div>

                      <div className="flex flex-1 flex-col gap-2 p-4">
                        <h2 className="font-medium leading-snug text-text-primary">
                          <Link
                            href={localePath(locale, `/shop/${product.slug}`)}
                            className="after:absolute after:inset-0 after:content-['']"
                          >
                            {product.name}
                          </Link>
                        </h2>
                        {product.summary ? (
                          <p className="line-clamp-2 text-sm text-text-secondary">
                            {product.summary}
                          </p>
                        ) : null}

                        <div className="mt-auto flex items-center justify-between pt-2">
                          <span className="font-semibold text-text-primary">
                            {formatPrice(product.priceCents, product.currency, locale)}
                          </span>
                          {product.stock !== null && product.stock <= 0 ? (
                            <Badge tone="danger">Out of stock</Badge>
                          ) : product.type === 'DIGITAL' ? (
                            <Badge tone="accent">Digital</Badge>
                          ) : null}
                        </div>
                      </div>
                    </article>
                  </li>
                ))}
              </ul>

              {meta && meta.totalPages > 1 ? (
                <Pagination meta={meta} basePath={localePath(locale, '/shop')} />
              ) : null}
            </>
          )}
        </div>
      </section>
    </>
  );
}
