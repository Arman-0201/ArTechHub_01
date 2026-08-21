import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Newspaper } from 'lucide-react';
import { getBlogPosts, getBootstrap } from '@/lib/api/queries';
import { buildPageMetadata } from '@/lib/seo';
import { localePath } from '@/lib/i18n/config';
import { formatDate } from '@/lib/utils';
import { EmptyState } from '@/components/ui';
import { Pagination } from '@/components/ui/pagination';

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
    path: '/blog',
    fallbackTitle: 'Articles',
    fallbackDescription: 'Practical writing on networking, development, cloud and security.',
  });
}

export default async function BlogIndexPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string; tag?: string }>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);

  // The blog is feature-flagged; the API enforces it too, but returning 404
  // here avoids rendering a shell for a section that is switched off.
  const bootstrap = await getBootstrap(locale);
  if (!bootstrap.features.BLOG_ENABLED) notFound();

  const page = Math.max(1, Number.parseInt(query.page ?? '1', 10) || 1);
  const { items, meta } = await getBlogPosts(locale, { page, pageSize: 9, tag: query.tag });

  const [featured, ...rest] = page === 1 ? items : [undefined, ...items];

  return (
    <>
      <section className="border-b border-border bg-background-subtle py-12 sm:py-16">
        <div className="container-page max-w-2xl space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Writing</p>
          <h1 className="text-3xl font-semibold tracking-tight text-text-primary sm:text-4xl">
            Articles
          </h1>
          <p className="text-lg leading-relaxed text-text-secondary">
            Practical pieces on the things we teach — written by the people who teach them.
          </p>
        </div>
      </section>

      <section className="py-12 sm:py-16">
        <div className="container-page space-y-10">
          {items.length === 0 ? (
            <EmptyState
              icon={<Newspaper className="size-8" />}
              title="No articles published yet."
              description="Check back soon."
            />
          ) : (
            <>
              {featured ? (
                <article className="group relative grid gap-6 overflow-hidden rounded-2xl border border-border bg-surface transition-[border-color] hover:border-accent lg:grid-cols-2">
                  {featured.coverImageUrl ? (
                    <div className="aspect-[16/10] overflow-hidden bg-surface-sunken lg:aspect-auto">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={featured.coverImageUrl}
                        alt=""
                        className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                      />
                    </div>
                  ) : null}

                  <div className="flex flex-col justify-center gap-3 p-6 lg:p-10">
                    <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                      Latest
                    </p>
                    <h2 className="text-2xl font-semibold leading-tight text-text-primary sm:text-3xl">
                      <Link
                        href={localePath(locale, `/blog/${featured.slug}`)}
                        className="after:absolute after:inset-0 after:content-['']"
                      >
                        {featured.title}
                      </Link>
                    </h2>
                    {featured.excerpt ? (
                      <p className="text-base leading-relaxed text-text-secondary">
                        {featured.excerpt}
                      </p>
                    ) : null}
                    <p className="text-sm text-text-muted">
                      {featured.author?.name ? `${featured.author.name} · ` : ''}
                      {featured.publishedAt ? formatDate(featured.publishedAt, locale) : ''} ·{' '}
                      {featured.readingMinutes} min read
                    </p>
                  </div>
                </article>
              ) : null}

              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {rest.filter(Boolean).map((post) => (
                  <article
                    key={post!.id}
                    className="group relative flex flex-col overflow-hidden rounded-xl border border-border bg-surface transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-accent"
                  >
                    {post!.coverImageUrl ? (
                      <div className="aspect-[16/9] overflow-hidden bg-surface-sunken">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={post!.coverImageUrl}
                          alt=""
                          className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                          loading="lazy"
                        />
                      </div>
                    ) : null}

                    <div className="flex flex-1 flex-col gap-2 p-5">
                      {post!.tags.length > 0 ? (
                        <p className="text-2xs font-semibold uppercase tracking-wider text-primary">
                          {post!.tags[0]}
                        </p>
                      ) : null}
                      <h2 className="font-semibold leading-snug text-text-primary">
                        <Link
                          href={localePath(locale, `/blog/${post!.slug}`)}
                          className="after:absolute after:inset-0 after:content-['']"
                        >
                          {post!.title}
                        </Link>
                      </h2>
                      {post!.excerpt ? (
                        <p className="line-clamp-3 text-sm leading-relaxed text-text-secondary">
                          {post!.excerpt}
                        </p>
                      ) : null}
                      <p className="mt-auto pt-2 text-xs text-text-muted">
                        {post!.publishedAt ? formatDate(post!.publishedAt, locale) : ''} ·{' '}
                        {post!.readingMinutes} min read
                      </p>
                    </div>
                  </article>
                ))}
              </div>

              {meta && meta.totalPages > 1 ? (
                <Pagination
                  meta={meta}
                  basePath={localePath(locale, '/blog')}
                  searchParams={{ tag: query.tag }}
                />
              ) : null}
            </>
          )}
        </div>
      </section>
    </>
  );
}
