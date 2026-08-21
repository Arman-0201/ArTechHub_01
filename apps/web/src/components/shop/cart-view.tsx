'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, Minus, Plus, ShoppingCart, Trash2 } from 'lucide-react';
import type { CartDto } from '@academy/types';
import { api } from '@/lib/api/client';
import { useCartStore } from '@/lib/cart-store';
import { localePath } from '@/lib/i18n/config';
import { formatPrice } from '@/lib/utils';
import { Alert, Button, Card, EmptyState } from '@/components/ui';

/**
 * Cart.
 *
 * The browser holds ids and quantities; the server returns the priced cart.
 * If a product has been deactivated or is out of stock since it was added, the
 * server simply omits or clamps that line — so the totals shown here are always
 * what the order would actually cost.
 */
export function CartView({ locale }: { locale: string }) {
  const entries = useCartStore((state) => state.entries);
  const setQuantity = useCartStore((state) => state.setQuantity);
  const remove = useCartStore((state) => state.remove);

  const [cart, setCart] = useState<CartDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => setIsMounted(true), []);

  useEffect(() => {
    if (!isMounted) return;

    if (entries.length === 0) {
      setCart({ lines: [], subtotalCents: 0, currency: 'USD', itemCount: 0 });
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    setIsLoading(true);

    api
      .post<CartDto>('/shop/cart/price', { lines: entries }, { signal: controller.signal })
      .then((priced) => {
        setCart(priced);
        setError(null);
      })
      .catch(() => setError('Could not price your cart. Please refresh.'))
      .finally(() => setIsLoading(false));

    return () => controller.abort();
  }, [entries, isMounted]);

  if (!isMounted || isLoading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="size-6 animate-spin text-text-muted" aria-hidden="true" />
        <span className="sr-only">Loading your cart</span>
      </div>
    );
  }

  // A line dropped by the server means the product is no longer purchasable.
  const droppedCount = entries.length - (cart?.lines.length ?? 0);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight text-text-primary">Your cart</h1>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      {droppedCount > 0 ? (
        <Alert tone="warning">
          {droppedCount} item{droppedCount === 1 ? '' : 's'} in your cart{' '}
          {droppedCount === 1 ? 'is' : 'are'} no longer available and{' '}
          {droppedCount === 1 ? 'has' : 'have'} been removed from the total.
        </Alert>
      ) : null}

      {!cart || cart.lines.length === 0 ? (
        <EmptyState
          icon={<ShoppingCart className="size-8" />}
          title="Your cart is empty."
          description="Browse the shop to find learning materials."
          action={
            <Link
              href={localePath(locale, '/shop')}
              className="text-sm font-medium text-primary hover:underline"
            >
              Go to the shop
            </Link>
          }
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
            {cart.lines.map((line) => (
              <li key={line.productId} className="flex gap-4 p-4">
                <div className="size-20 shrink-0 overflow-hidden rounded-lg bg-surface-sunken">
                  {line.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={line.imageUrl} alt="" className="size-full object-cover" />
                  ) : null}
                </div>

                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate font-medium text-text-primary">
                        <Link
                          href={localePath(locale, `/shop/${line.slug}`)}
                          className="hover:text-primary"
                        >
                          {line.name}
                        </Link>
                      </h2>
                      <p className="text-sm text-text-muted">
                        {formatPrice(line.unitPriceCents, line.currency, locale)} each
                      </p>
                    </div>
                    <p className="shrink-0 font-semibold text-text-primary">
                      {formatPrice(line.lineTotalCents, line.currency, locale)}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="inline-flex items-center rounded-lg border border-border">
                      <button
                        type="button"
                        onClick={() => setQuantity(line.productId, line.quantity - 1)}
                        className="grid size-8 place-items-center rounded-l-lg text-text-secondary transition-colors hover:bg-surface-sunken"
                        aria-label={`Decrease quantity of ${line.name}`}
                      >
                        <Minus className="size-3.5" aria-hidden="true" />
                      </button>
                      <span className="w-9 text-center text-sm tabular-nums text-text-primary">
                        {line.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => setQuantity(line.productId, line.quantity + 1)}
                        className="grid size-8 place-items-center rounded-r-lg text-text-secondary transition-colors hover:bg-surface-sunken"
                        aria-label={`Increase quantity of ${line.name}`}
                      >
                        <Plus className="size-3.5" aria-hidden="true" />
                      </button>
                    </div>

                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => remove(line.productId)}
                      aria-label={`Remove ${line.name} from the cart`}
                    >
                      <Trash2 className="size-3.5 text-danger" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <Card className="h-fit lg:sticky lg:top-24">
            <div className="space-y-4 p-5">
              <h2 className="font-semibold text-text-primary">Summary</h2>

              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-text-muted">Items</dt>
                  <dd className="text-text-primary">{cart.itemCount}</dd>
                </div>
                <div className="flex justify-between border-t border-border pt-2">
                  <dt className="font-medium text-text-primary">Subtotal</dt>
                  <dd className="text-lg font-semibold text-text-primary">
                    {formatPrice(cart.subtotalCents, cart.currency, locale)}
                  </dd>
                </div>
              </dl>

              <p className="text-xs text-text-muted">
                Shipping and taxes, where they apply, are calculated at checkout.
              </p>

              <Button href={localePath(locale, '/checkout')} fullWidth size="lg">
                Checkout
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
