import type { Metadata } from 'next';
import Link from 'next/link';
import * as Icons from 'lucide-react';
import { Layers } from 'lucide-react';
import { getCategories } from '@/lib/api/queries';
import { buildPageMetadata } from '@/lib/seo';
import { localePath } from '@/lib/i18n/config';
import { colorFromString } from '@/lib/utils';
import { EmptyState } from '@/components/ui';

export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildPageMetadata({
    seo: null,
    locale,
    path: '/categories',
    fallbackTitle: 'Categories',
    fallbackDescription: 'Explore every learning track and the courses inside it.',
  });
}

function resolveIcon(name: string | null | undefined) {
  if (!name) return null;
  const candidate = (Icons as unknown as Record<string, unknown>)[name];
  return typeof candidate === 'function' ? (candidate as typeof Layers) : null;
}

export default async function CategoriesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const categories = await getCategories(locale);

  return (
    <>
      <section className="border-b border-border bg-background-subtle py-12 sm:py-16">
        <div className="container-page max-w-2xl space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Tracks</p>
          <h1 className="text-3xl font-semibold tracking-tight text-text-primary sm:text-4xl">
            Learn by track
          </h1>
          <p className="text-lg leading-relaxed text-text-secondary">
            Each track groups courses into a sensible order, so there is always an obvious next
            step rather than a list to guess from.
          </p>
        </div>
      </section>

      <section className="py-12 sm:py-16">
        <div className="container-page">
          {categories.length === 0 ? (
            <EmptyState
              icon={<Layers className="size-8" />}
              title="No tracks published yet."
              description="Categories will appear here once an administrator publishes them."
            />
          ) : (
            <div className="space-y-12">
              {categories.map((category) => {
                const Icon = resolveIcon(category.iconName);
                const accent = category.colorHex ?? colorFromString(category.slug);
                const children = category.children ?? [];

                return (
                  <section key={category.id} aria-labelledby={`category-${category.id}`}>
                    <div className="flex items-start gap-4">
                      <span
                        className="grid size-12 shrink-0 place-items-center rounded-xl"
                        style={{ backgroundColor: `${accent}1a`, color: accent }}
                        aria-hidden="true"
                      >
                        {Icon ? <Icon className="size-6" /> : <Layers className="size-6" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <h2
                          id={`category-${category.id}`}
                          className="text-xl font-semibold text-text-primary sm:text-2xl"
                        >
                          <Link
                            href={localePath(locale, `/categories/${category.slug}`)}
                            className="transition-colors hover:text-primary"
                          >
                            {category.name}
                          </Link>
                        </h2>
                        {category.description ? (
                          <p className="mt-1 max-w-2xl text-text-secondary">
                            {category.description}
                          </p>
                        ) : null}
                        <p className="mt-1 text-sm text-text-muted">
                          {category.courseCount}{' '}
                          {category.courseCount === 1 ? 'course' : 'courses'}
                        </p>
                      </div>
                    </div>

                    {children.length > 0 ? (
                      <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {children.map((child) => {
                          const ChildIcon = resolveIcon(child.iconName);
                          return (
                            <li key={child.id}>
                              <Link
                                href={localePath(locale, `/categories/${child.slug}`)}
                                className="group flex h-full flex-col gap-2 rounded-xl border border-border bg-surface p-5 transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-accent"
                              >
                                <span className="flex items-center gap-2.5">
                                  {ChildIcon ? (
                                    <ChildIcon
                                      className="size-4 shrink-0"
                                      style={{ color: accent }}
                                      aria-hidden="true"
                                    />
                                  ) : null}
                                  <span className="font-medium text-text-primary group-hover:text-primary">
                                    {child.name}
                                  </span>
                                </span>
                                {child.description ? (
                                  <span className="line-clamp-2 text-sm text-text-secondary">
                                    {child.description}
                                  </span>
                                ) : null}
                                <span className="mt-auto pt-1 text-xs text-text-muted">
                                  {child.courseCount}{' '}
                                  {child.courseCount === 1 ? 'course' : 'courses'}
                                </span>
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                  </section>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
