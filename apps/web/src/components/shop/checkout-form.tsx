'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Loader2, ShoppingCart } from 'lucide-react';
import type { CartDto, OrderDto } from '@academy/types';
import { api } from '@/lib/api/client';
import { ApiError } from '@/lib/api/types';
import { useCartStore } from '@/lib/cart-store';
import { localePath } from '@/lib/i18n/config';
import { formatPrice } from '@/lib/utils';
import { Alert, Button, Card, EmptyState, Input, Textarea } from '@/components/ui';

/**
 * Checkout.
 *
 * Payment is intentionally not wired to a provider. The order is created in
 * `AWAITING_PAYMENT` with provider-agnostic reference columns, so integrating
 * Stripe, Adyen or a local gateway means adding one adapter that fills those in
 * and advances the status — not reworking checkout or the schema.
 *
 * No card details are collected or stored here, by design.
 */
export function CheckoutForm({
  locale,
  defaultName,
  defaultEmail,
}: {
  locale: string;
  defaultName: string;
  defaultEmail: string;
}) {
  const entries = useCartStore((state) => state.entries);
  const clear = useCartStore((state) => state.clear);

  const [cart, setCart] = useState<CartDto | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [order, setOrder] = useState<OrderDto | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: defaultName,
    email: defaultEmail,
    phone: '',
    line1: '',
    line2: '',
    city: '',
    postalCode: '',
    country: '',
    notes: '',
  });

  useEffect(() => setIsMounted(true), []);

  useEffect(() => {
    if (!isMounted || entries.length === 0 || order) return;

    api
      .post<CartDto>('/shop/cart/price', { lines: entries })
      .then(setCart)
      .catch(() => setError('Could not price your cart. Please go back and try again.'));
  }, [entries, isMounted, order]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const created = await api.post<OrderDto>('/shop/checkout', {
        lines: entries,
        customer: {
          name: form.name,
          email: form.email,
          ...(form.phone ? { phone: form.phone } : {}),
        },
        ...(form.line1
          ? {
              shippingAddress: {
                line1: form.line1,
                ...(form.line2 ? { line2: form.line2 } : {}),
                city: form.city,
                postalCode: form.postalCode,
                country: form.country.toUpperCase(),
              },
            }
          : {}),
        ...(form.notes ? { notes: form.notes } : {}),
      });

      setOrder(created);
      clear();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'Could not place your order. Please try again.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (order) {
    return (
      <div className="mx-auto max-w-lg space-y-6 text-center">
        <CheckCircle2 className="mx-auto size-14 text-success" aria-hidden="true" />
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-text-primary">Order placed</h1>
          <p className="text-text-secondary">
            Your reference is{' '}
            <span className="font-mono font-semibold text-text-primary">{order.reference}</span>. We
            have emailed the details to {order.customer?.email}.
          </p>
        </div>

        <Card>
          <div className="space-y-2 p-5 text-left text-sm">
            {order.items.map((item) => (
              <div key={item.id} className="flex justify-between">
                <span className="text-text-secondary">
                  {item.name} × {item.quantity}
                </span>
                <span className="text-text-primary">
                  {formatPrice(item.totalCents, order.currency, locale)}
                </span>
              </div>
            ))}
            <div className="flex justify-between border-t border-border pt-2 font-semibold">
              <span className="text-text-primary">Total</span>
              <span className="text-text-primary">
                {formatPrice(order.totalCents, order.currency, locale)}
              </span>
            </div>
          </div>
        </Card>

        <Button href={localePath(locale, '/shop')} variant="outline">
          Back to the shop
        </Button>
      </div>
    );
  }

  if (!isMounted) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="size-6 animate-spin text-text-muted" aria-hidden="true" />
        <span className="sr-only">Loading checkout</span>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <EmptyState
        icon={<ShoppingCart className="size-8" />}
        title="Your cart is empty."
        description="Add something to your cart before checking out."
        action={
          <Link
            href={localePath(locale, '/shop')}
            className="text-sm font-medium text-primary hover:underline"
          >
            Go to the shop
          </Link>
        }
      />
    );
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-4xl space-y-6" noValidate>
      <h1 className="text-3xl font-semibold tracking-tight text-text-primary">Checkout</h1>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-6">
          <Card>
            <div className="space-y-4 p-5">
              <h2 className="font-semibold text-text-primary">Your details</h2>

              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Full name"
                  required
                  autoComplete="name"
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                />
                <Input
                  label="Email address"
                  type="email"
                  required
                  autoComplete="email"
                  value={form.email}
                  onChange={(event) => setForm({ ...form, email: event.target.value })}
                />
              </div>

              <Input
                label="Phone"
                type="tel"
                autoComplete="tel"
                hint="Optional. Used only if there is a problem with your order."
                value={form.phone}
                onChange={(event) => setForm({ ...form, phone: event.target.value })}
              />
            </div>
          </Card>

          <Card>
            <div className="space-y-4 p-5">
              <div>
                <h2 className="font-semibold text-text-primary">Shipping address</h2>
                <p className="text-sm text-text-muted">
                  Only needed for physical items — leave blank for digital orders.
                </p>
              </div>

              <Input
                label="Address line 1"
                autoComplete="address-line1"
                value={form.line1}
                onChange={(event) => setForm({ ...form, line1: event.target.value })}
              />
              <Input
                label="Address line 2"
                autoComplete="address-line2"
                value={form.line2}
                onChange={(event) => setForm({ ...form, line2: event.target.value })}
              />

              <div className="grid gap-4 sm:grid-cols-3">
                <Input
                  label="City"
                  autoComplete="address-level2"
                  value={form.city}
                  onChange={(event) => setForm({ ...form, city: event.target.value })}
                />
                <Input
                  label="Postal code"
                  autoComplete="postal-code"
                  value={form.postalCode}
                  onChange={(event) => setForm({ ...form, postalCode: event.target.value })}
                />
                <Input
                  label="Country"
                  maxLength={2}
                  placeholder="AM"
                  hint="Two-letter code."
                  autoComplete="country"
                  value={form.country}
                  onChange={(event) =>
                    setForm({ ...form, country: event.target.value.toUpperCase() })
                  }
                />
              </div>

              <Textarea
                label="Order notes"
                rows={2}
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
              />
            </div>
          </Card>
        </div>

        <Card className="h-fit lg:sticky lg:top-24">
          <div className="space-y-4 p-5">
            <h2 className="font-semibold text-text-primary">Order summary</h2>

            {cart ? (
              <>
                <ul className="space-y-2 text-sm">
                  {cart.lines.map((line) => (
                    <li key={line.productId} className="flex justify-between gap-3">
                      <span className="min-w-0 truncate text-text-secondary">
                        {line.name} × {line.quantity}
                      </span>
                      <span className="shrink-0 text-text-primary">
                        {formatPrice(line.lineTotalCents, line.currency, locale)}
                      </span>
                    </li>
                  ))}
                </ul>

                <div className="flex justify-between border-t border-border pt-3">
                  <span className="font-medium text-text-primary">Total</span>
                  <span className="text-lg font-semibold text-text-primary">
                    {formatPrice(cart.subtotalCents, cart.currency, locale)}
                  </span>
                </div>
              </>
            ) : (
              <div className="skeleton h-24 rounded-lg" />
            )}

            <Button type="submit" fullWidth size="lg" isLoading={isSubmitting}>
              Place order
            </Button>

            <p className="text-xs text-text-muted">
              No payment is taken here. You will receive payment instructions by email once the
              order is confirmed.
            </p>
          </div>
        </Card>
      </div>
    </form>
  );
}
