'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/**
 * Cart state.
 *
 * The one piece of genuinely global client state in the app, which is why
 * Zustand appears here and nowhere else.
 *
 * It stores product ids and quantities only — never prices. Every total shown
 * to the user is computed by the API from live product rows, so a tampered
 * localStorage value cannot change what an order costs. The worst a modified
 * cart can do is ask to buy a different quantity, which the server then
 * validates against stock.
 */

export interface CartEntry {
  productId: string;
  quantity: number;
}

interface CartState {
  entries: CartEntry[];
  add: (productId: string, quantity?: number) => void;
  setQuantity: (productId: string, quantity: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
  itemCount: () => number;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      entries: [],

      add: (productId, quantity = 1) =>
        set((state) => {
          const existing = state.entries.find((entry) => entry.productId === productId);
          if (existing) {
            return {
              entries: state.entries.map((entry) =>
                entry.productId === productId
                  ? { ...entry, quantity: Math.min(99, entry.quantity + quantity) }
                  : entry,
              ),
            };
          }
          return { entries: [...state.entries, { productId, quantity }] };
        }),

      setQuantity: (productId, quantity) =>
        set((state) => ({
          // Setting a quantity of zero removes the line, which is what the
          // stepper's minus button does at 1.
          entries:
            quantity <= 0
              ? state.entries.filter((entry) => entry.productId !== productId)
              : state.entries.map((entry) =>
                  entry.productId === productId
                    ? { ...entry, quantity: Math.min(99, quantity) }
                    : entry,
                ),
        })),

      remove: (productId) =>
        set((state) => ({
          entries: state.entries.filter((entry) => entry.productId !== productId),
        })),

      clear: () => set({ entries: [] }),

      itemCount: () => get().entries.reduce((total, entry) => total + entry.quantity, 0),
    }),
    {
      name: 'academy-cart',
      // `createJSONStorage` returns undefined during SSR, which is what keeps
      // the store from touching localStorage on the server.
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ entries: state.entries }),
    },
  ),
);
