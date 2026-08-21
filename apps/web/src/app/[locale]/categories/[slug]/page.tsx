import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BookOpen } from 'lucide-react';
import { getCategory, getCourses } from '@/lib/api/queries';
import { breadcrumbStructuredData, buildPageMetadata, siteUrl } from '@/lib/seo';
import { localePath } from '@/lib/i18n/config';
import { Breadcrumbs, EmptyState } from '@/components/ui';
import { CourseCardGrid } from '@/components/courses/course-card';
import { Pagination } from '@/components/ui/pagination';
import { StructuredData } from '@/components/seo/structured-data';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const category = await getCategory(slug, locale);
  if (!category) return { title: 'Category not found' };

  return buildPageMetadata({
    seo: category.seo ?? null,
    locale,
    path: `/categories/${category.slug}`,
    fallbackTitle: category.name,
    fallbackDescription: category.description ?? undefined,
    imageUrl: category.imageUrl,
  });
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const [{ locale, slug }, query] = await Promise.all([params, searchParams]);

  const category = await getCategory(slug, locale);
  if (!category) notFound();

  const page = Math.max(1, Number.parseInt(query.page ?? '1', 10) || 1);
  const { items, meta } = await getCourses(locale, { page, pageSize: 12, category: slug });

  const breadcrumbs = [
    { label: 'Home', href: localePath(locale, '/') },
    { label: 'Categories', href: localePath(locale, '/categories') },
    { label: category.name },
  ];

  return (
    <>
      <StructuredData
        data={breadcrumbStructuredData([
          { name: 'Home', url: siteUrl(locale) },
          { name: 'Categories', url: siteUrl(locale, '/categories') },
          { name: category.name, url: siteUrl(locale, `/categories/${category.slug}`) },
        ])}
      />

      <section className="border-b border-border bg-background-subtle py-10 sm:py-14">
        <div className="container-page">
          <Breadcrumbs items={breadcrumbs} className="mb-5" />
          <div className="max-w-2xl space-y-3">
            <h1 className="text-3xl font-semibold tracking-tight text-text-primary sm:text-4xl">
              {category.name}
            </h1>
            {category.description ? (
              <p className="text-lg leading-relaxed text-text-secondary">{category.description}</p>
            ) : null}
            <p className="text-sm text-text-muted">
              {category.courseCount} {category.courseCount === 1 ? 'course' : 'courses'}
            </p>
          </div>

          {category.children && category.children.length > 0 ? (
            <ul className="mt-6 flex flex-wrap gap-2">
              {category.children.map((child) => (
                <li key={child.id}>
                  <Link
                    href={localePath(locale, `/categories/${child.slug}`)}
                    className="inline-flex rounded-full border border-border bg-surface px-3.5 py-1.5 text-sm text-text-secondary transition-colors hover:border-primary hover:text-primary"
                  >
                    {child.name}
                    <span className="ml-1.5 text-text-muted">{child.courseCount}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </section>

      <section className="py-10 sm:py-14">
        <div className="container-page space-y-8">
          {items.length > 0 ? (
            <>
              <CourseCardGrid courses={items} locale={locale} columns={3} />
              {meta && meta.totalPages > 1 ? (
                <Pagination
                  meta={meta}
                  basePath={localePath(locale, `/categories/${slug}`)}
                />
              ) : null}
            </>
          ) : (
            <EmptyState
              icon={<BookOpen className="size-8" />}
              title="No published courses in this track yet."
              description="Check back soon, or browse the full catalogue."
              action={
                <Link
                  href={localePath(locale, '/courses')}
                  className="text-sm font-medium text-primary hover:underline"
                >
                  Browse all courses
                </Link>
              }
            />
          )}
        </div>
      </section>
    </>
  );
}
