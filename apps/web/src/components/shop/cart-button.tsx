'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ShoppingCart } from 'lucide-react';
import { useCartStore } from '@/lib/cart-store';
import { localePath } from '@/lib/i18n/config';

/**
 * Cart link with an item count.
 *
 * The count only renders after mount: the store hydrates from localStorage,
 * which the server cannot know about, so rendering it during SSR would produce
 * a hydration mismatch.
 */
export function CartButton({ locale }: { locale: string }) {
  const entries = useCartStore((state) => state.entries);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => setIsMounted(true), []);

  const count = entries.reduce((total, entry) => total + entry.quantity, 0);

  return (
    <Link
      href={localePath(locale, '/cart')}
      className="relative inline-flex h-11 items-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-medium text-text-secondary transition-colors hover:border-primary hover:text-primary"
    >
      <ShoppingCart className="size-4" aria-hidden="true" />
      Cart
      {isMounted && count > 0 ? (
        <span className="grid size-5 place-items-center rounded-full bg-primary text-2xs font-semibold text-text-on-primary">
          {count > 99 ? '99+' : count}
        </span>
      ) : null}
    </Link>
  );
}
