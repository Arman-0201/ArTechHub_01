'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Minus, Plus, ShoppingCart } from 'lucide-react';
import { useCartStore } from '@/lib/cart-store';
import { localePath } from '@/lib/i18n/config';
import { Button } from '@/components/ui';

export function AddToCartButton({
  productId,
  locale,
  disabled,
  maxQuantity = 99,
}: {
  productId: string;
  locale: string;
  disabled?: boolean;
  maxQuantity?: number;
}) {
  const router = useRouter();
  const add = useCartStore((state) => state.add);

  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);

  function handleAdd() {
    add(productId, quantity);
    setAdded(true);
    // Revert to the default label so the button does not stay stuck on
    // "Added" if the visitor wants to add more.
    setTimeout(() => setAdded(false), 2000);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex items-center rounded-lg border border-border">
          <button
            type="button"
            onClick={() => setQuantity((value) => Math.max(1, value - 1))}
            disabled={disabled || quantity <= 1}
            className="grid size-11 place-items-center rounded-l-lg text-text-secondary transition-colors hover:bg-surface-sunken disabled:opacity-40"
            aria-label="Decrease quantity"
          >
            <Minus className="size-4" aria-hidden="true" />
          </button>

          <span
            className="w-12 text-center text-sm font-medium tabular-nums text-text-primary"
            aria-live="polite"
            aria-label={`Quantity: ${quantity}`}
          >
            {quantity}
          </span>

          <button
            type="button"
            onClick={() => setQuantity((value) => Math.min(maxQuantity, value + 1))}
            disabled={disabled || quantity >= maxQuantity}
            className="grid size-11 place-items-center rounded-r-lg text-text-secondary transition-colors hover:bg-surface-sunken disabled:opacity-40"
            aria-label="Increase quantity"
          >
            <Plus className="size-4" aria-hidden="true" />
          </button>
        </div>

        <Button onClick={handleAdd} disabled={disabled} size="lg">
          {added ? (
            <>
              <Check className="size-4" aria-hidden="true" />
              Added to cart
            </>
          ) : (
            <>
              <ShoppingCart className="size-4" aria-hidden="true" />
              Add to cart
            </>
          )}
        </Button>
      </div>

      {added ? (
        <Button variant="link" onClick={() => router.push(localePath(locale, '/cart'))}>
          View cart
        </Button>
      ) : null}
    </div>
  );
}
