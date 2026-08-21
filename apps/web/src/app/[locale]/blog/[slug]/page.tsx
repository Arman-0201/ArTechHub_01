import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getBlogPost, getBootstrap } from '@/lib/api/queries';
import { articleStructuredData, buildPageMetadata, siteUrl } from '@/lib/seo';
import { localePath } from '@/lib/i18n/config';
import { colorFromString, formatDate } from '@/lib/utils';
import { Breadcrumbs } from '@/components/ui';
import { RichText, richTextToPlainText } from '@/components/content/rich-text';
import { StructuredData } from '@/components/seo/structured-data';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const post = await getBlogPost(slug, locale);
  if (!post) return { title: 'Article not found' };

  return buildPageMetadata({
    seo: post.seo,
    locale,
    path: `/blog/${post.slug}`,
    fallbackTitle: post.title,
    fallbackDescription: post.excerpt ?? richTextToPlainText(post.body, 160),
    imageUrl: post.coverImageUrl,
    type: 'article',
    publishedTime: post.publishedAt,
    modifiedTime: post.updatedAt,
  });
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;

  const [post, bootstrap] = await Promise.all([getBlogPost(slug, locale), getBootstrap(locale)]);
  if (!post) notFound();

  return (
    <>
      <StructuredData
        data={articleStructuredData({
          headline: post.title,
          description: post.excerpt,
          url: siteUrl(locale, `/blog/${post.slug}`),
          imageUrl: post.coverImageUrl,
          authorName: post.author?.name ?? null,
          publishedAt: post.publishedAt,
          modifiedAt: post.updatedAt,
          publisherName: bootstrap.settings.siteName,
        })}
      />

      <article className="py-10 sm:py-14">
        <div className="container-page">
          <div className="container-prose">
            <Breadcrumbs
              items={[
                { label: 'Home', href: localePath(locale, '/') },
                { label: 'Articles', href: localePath(locale, '/blog') },
                { label: post.title },
              ]}
              className="mb-8"
            />

            <header className="space-y-5">
              {post.tags.length > 0 ? (
                <ul className="flex flex-wrap gap-2">
                  {post.tags.map((tag) => (
                    <li key={tag}>
                      <Link
                        href={localePath(
                          locale,
                          `/blog?tag=${encodeURIComponent(tag.toLowerCase().replace(/\s+/g, '-'))}`,
                        )}
                        className="inline-flex rounded-full bg-primary-soft px-3 py-1 text-xs font-medium text-primary transition-opacity hover:opacity-80"
                      >
                        {tag}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}

              <h1 className="text-3xl font-semibold leading-tight tracking-tight text-text-primary sm:text-4xl lg:text-[2.75rem]">
                {post.title}
              </h1>

              {post.excerpt ? (
                <p className="text-xl leading-relaxed text-text-secondary">{post.excerpt}</p>
              ) : null}

              <div className="flex flex-wrap items-center gap-3 border-y border-border py-4">
                {post.author ? (
                  <>
                    {post.author.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={post.author.avatarUrl}
                        alt=""
                        className="size-10 rounded-full object-cover"
                      />
                    ) : (
                      <span
                        className="grid size-10 place-items-center rounded-full text-sm font-semibold text-white"
                        style={{ backgroundColor: colorFromString(post.author.id) }}
                        aria-hidden="true"
                      >
                        {post.author.name.slice(0, 1)}
                      </span>
                    )}
                    <div className="text-sm">
                      <p className="font-medium text-text-primary">{post.author.name}</p>
                      <p className="text-text-muted">
                        {post.publishedAt ? formatDate(post.publishedAt, locale) : ''} ·{' '}
                        {post.readingMinutes} min read
                      </p>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-text-muted">
                    {post.publishedAt ? formatDate(post.publishedAt, locale) : ''} ·{' '}
                    {post.readingMinutes} min read
                  </p>
                )}
              </div>
            </header>

            {post.coverImageUrl ? (
              <figure className="my-10">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={post.coverImageUrl}
                  alt=""
                  className="w-full rounded-2xl border border-border"
                />
              </figure>
            ) : null}

            <RichText document={post.body} className="mt-10" />

            <footer className="mt-14 border-t border-border pt-8">
              <Link
                href={localePath(locale, '/blog')}
                className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
              >
                <ArrowLeft className="size-4" aria-hidden="true" />
                All articles
              </Link>
            </footer>
          </div>
        </div>
      </article>
    </>
  );
}
