import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ExternalLink } from 'lucide-react';
import { getInstructor } from '@/lib/api/queries';
import { buildPageMetadata } from '@/lib/seo';
import { localePath } from '@/lib/i18n/config';
import { colorFromString } from '@/lib/utils';
import { Breadcrumbs, SectionHeading } from '@/components/ui';
import { CourseCardGrid } from '@/components/courses/course-card';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const data = await getInstructor(slug, locale);
  if (!data) return { title: 'Instructor not found' };

  return buildPageMetadata({
    seo: null,
    locale,
    path: `/instructors/${data.instructor.slug}`,
    fallbackTitle: data.instructor.name,
    fallbackDescription: data.instructor.headline ?? undefined,
    imageUrl: data.instructor.avatarUrl,
  });
}

export default async function InstructorPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;

  const data = await getInstructor(slug, locale);
  if (!data) notFound();

  const { instructor, courses } = data;

  return (
    <>
      <section className="border-b border-border bg-background-subtle py-10 sm:py-14">
        <div className="container-page">
          <Breadcrumbs
            items={[
              { label: 'Home', href: localePath(locale, '/') },
              { label: 'Instructors', href: localePath(locale, '/instructors') },
              { label: instructor.name },
            ]}
            className="mb-6"
          />

          <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
            {instructor.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={instructor.avatarUrl}
                alt=""
                className="size-24 shrink-0 rounded-2xl object-cover"
              />
            ) : (
              <span
                className="grid size-24 shrink-0 place-items-center rounded-2xl text-3xl font-semibold text-white"
                style={{ backgroundColor: colorFromString(instructor.slug) }}
                aria-hidden="true"
              >
                {instructor.name.slice(0, 1)}
              </span>
            )}

            <div className="min-w-0 space-y-3">
              <div className="space-y-1">
                <h1 className="text-3xl font-semibold tracking-tight text-text-primary">
                  {instructor.name}
                </h1>
                {instructor.headline ? (
                  <p className="text-lg text-text-secondary">{instructor.headline}</p>
                ) : null}
              </div>

              {instructor.bio ? (
                <p className="max-w-2xl leading-relaxed text-text-secondary">{instructor.bio}</p>
              ) : null}

              {instructor.links.length > 0 ? (
                <ul className="flex flex-wrap gap-2 pt-1">
                  {instructor.links.map((link) => (
                    <li key={link.url}>
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3.5 py-1.5 text-sm text-text-secondary transition-colors hover:border-primary hover:text-primary"
                      >
                        {link.label}
                        <ExternalLink className="size-3" aria-hidden="true" />
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section className="py-12 sm:py-16">
        <div className="container-page space-y-8">
          <SectionHeading
            title={`Courses by ${instructor.name}`}
            description={
              courses.length === 0
                ? undefined
                : `${courses.length} published ${courses.length === 1 ? 'course' : 'courses'}.`
            }
          />

          {courses.length > 0 ? (
            <CourseCardGrid courses={courses} locale={locale} columns={3} />
          ) : (
            <p className="text-text-muted">No published courses yet.</p>
          )}
        </div>
      </section>
    </>
  );
}
