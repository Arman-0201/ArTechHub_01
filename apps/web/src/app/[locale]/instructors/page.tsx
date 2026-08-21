import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Users } from 'lucide-react';
import { getBootstrap, getInstructors } from '@/lib/api/queries';
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
    path: '/instructors',
    fallbackTitle: 'Instructors',
    fallbackDescription: 'The working engineers who write and teach these courses.',
  });
}

export default async function InstructorsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  const bootstrap = await getBootstrap(locale);
  if (!bootstrap.features.INSTRUCTORS_ENABLED) notFound();

  const instructors = await getInstructors(locale);

  return (
    <>
      <section className="border-b border-border bg-background-subtle py-12 sm:py-16">
        <div className="container-page max-w-2xl space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
            Who teaches here
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-text-primary sm:text-4xl">
            Instructors
          </h1>
          <p className="text-lg leading-relaxed text-text-secondary">
            Every course is written by someone who does the work professionally, not by a
            content team.
          </p>
        </div>
      </section>

      <section className="py-12 sm:py-16">
        <div className="container-page">
          {instructors.length === 0 ? (
            <EmptyState
              icon={<Users className="size-8" />}
              title="No instructor profiles yet."
              description="Profiles appear here once they are published."
            />
          ) : (
            <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {instructors.map((instructor) => (
                <li key={instructor.id}>
                  <Link
                    href={localePath(locale, `/instructors/${instructor.slug}`)}
                    className="group flex h-full flex-col gap-4 rounded-xl border border-border bg-surface p-6 transition-[border-color,transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-accent hover:shadow-raised"
                  >
                    {instructor.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={instructor.avatarUrl}
                        alt=""
                        className="size-16 rounded-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <span
                        className="grid size-16 place-items-center rounded-full text-xl font-semibold text-white"
                        style={{ backgroundColor: colorFromString(instructor.slug) }}
                        aria-hidden="true"
                      >
                        {instructor.name.slice(0, 1)}
                      </span>
                    )}

                    <div className="space-y-1">
                      <h2 className="font-semibold text-text-primary group-hover:text-primary">
                        {instructor.name}
                      </h2>
                      {instructor.headline ? (
                        <p className="text-sm text-text-secondary">{instructor.headline}</p>
                      ) : null}
                    </div>

                    <p className="mt-auto text-xs text-text-muted">
                      {instructor.courseCount ?? 0}{' '}
                      {instructor.courseCount === 1 ? 'course' : 'courses'}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </>
  );
}
