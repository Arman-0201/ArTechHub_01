'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { readArray, readOptionalString, readString, type SectionProps } from './types';

interface FaqItem {
  question: string;
  answer: string;
}

/**
 * FAQ accordion.
 *
 * Built from native buttons with `aria-expanded` and `aria-controls` rather
 * than `<details>`, so the open/closed state is announced correctly and the
 * height transition can be animated.
 */
export function FaqSection({ section }: SectionProps) {
  const items = readArray<FaqItem>(section.content, 'items');
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  if (items.length === 0) return null;

  return (
    <section className="py-14 sm:py-20">
      <div className="container-page">
        <div className="mx-auto max-w-3xl">
          <div className="mb-8 space-y-2 text-center">
            <h2 className="text-2xl font-semibold text-text-primary sm:text-3xl">
              {readString(section.content, 'title', 'Frequently asked questions')}
            </h2>
            {readOptionalString(section.content, 'description') ? (
              <p className="text-text-secondary">{readString(section.content, 'description')}</p>
            ) : null}
          </div>

          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
            {items.map((item, index) => {
              const isOpen = openIndex === index;
              const panelId = `faq-panel-${section.id}-${index}`;
              const buttonId = `faq-button-${section.id}-${index}`;

              return (
                <li key={`${item.question}-${index}`}>
                  <h3>
                    <button
                      id={buttonId}
                      type="button"
                      aria-expanded={isOpen}
                      aria-controls={panelId}
                      onClick={() => setOpenIndex(isOpen ? null : index)}
                      className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-surface-sunken"
                    >
                      <span className="font-medium text-text-primary">{item.question}</span>
                      <ChevronDown
                        className={cn(
                          'size-4 shrink-0 text-text-muted transition-transform duration-200',
                          isOpen && 'rotate-180',
                        )}
                        aria-hidden="true"
                      />
                    </button>
                  </h3>
                  <div
                    id={panelId}
                    role="region"
                    aria-labelledby={buttonId}
                    hidden={!isOpen}
                    className="px-5 pb-5 text-[0.9375rem] leading-relaxed text-text-secondary"
                  >
                    {item.answer}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
