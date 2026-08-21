import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Clock,
  Globe,
  PlayCircle,
  Signal,
  Users,
} from 'lucide-react';
import { getBootstrap, getCourse } from '@/lib/api/queries';
import { buildPageMetadata, breadcrumbStructuredData, courseStructuredData, siteUrl } from '@/lib/seo';
import { localePath } from '@/lib/i18n/config';
import { colorFromString, formatDuration, formatNumber, formatPrice } from '@/lib/utils';
import { Badge, Breadcrumbs, Card, ProgressBar } from '@/components/ui';
import { RichText, richTextToPlainText } from '@/components/content/rich-text';
import { StructuredData } from '@/components/seo/structured-data';
import { CourseCurriculum } from '@/components/courses/course-curriculum';
import { EnrollButton } from '@/components/courses/enroll-button';

const LEVEL_LABELS: Record<string, string> = {
  BEGINNER: 'Beginner',
  INTERMEDIATE: 'Intermediate',
  ADVANCED: 'Advanced',
  EXPERT: 'Expert',
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const course = await getCourse(slug, locale);
  if (!course) return { title: 'Course not found' };

  return buildPageMetadata({
    seo: course.seo,
    locale,
    path: `/courses/${course.slug}`,
    fallbackTitle: course.title,
    fallbackDescription:
      course.summary ?? richTextToPlainText(course.description, 160) ?? undefined,
    imageUrl: course.thumbnailUrl,
  });
}

export default async function CourseDetailPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;

  const [course, bootstrap] = await Promise.all([getCourse(slug, locale), getBootstrap(locale)]);
  if (!course) notFound();

  const totalLessons = course.modules.reduce((total, module) => total + module.lessons.length, 0);
  const isEnrolled = course.viewer?.isEnrolled ?? false;
  const isPaid = course.accessType === 'PAID' && course.priceCents;

  // Resume where the learner stopped, or start at the first lesson.
  const firstLesson = course.modules.flatMap((module) => module.lessons)[0];
  const resumeLesson =
    course.modules
      .flatMap((module) => module.lessons)
      .find((lesson) => lesson.id === course.viewer?.resumeLessonId) ?? firstLesson;

  const breadcrumbs = [
    { label: 'Home', href: localePath(locale, '/') },
    { label: 'Courses', href: localePath(locale, '/courses') },
    ...(course.category
      ? [
          {
            label: course.category.name,
            href: localePath(locale, `/courses?category=${course.category.slug}`),
          },
        ]
      : []),
    { label: course.title },
  ];

  return (
    <>
      <StructuredData
        data={courseStructuredData({
          name: course.title,
          description: course.summary,
          url: siteUrl(locale, `/courses/${course.slug}`),
          imageUrl: course.thumbnailUrl,
          providerName: bootstrap.settings.siteName,
          providerUrl: siteUrl(locale),
          instructors: course.instructors,
          isFree: !isPaid,
          priceCents: course.priceCents,
          currency: course.currency,
        })}
      />
      <StructuredData
        data={breadcrumbStructuredData(
          breadcrumbs.map((crumb) => ({
            name: crumb.label,
            url: crumb.href ? siteUrl(locale, crumb.href.replace(`/${locale}`, '')) : siteUrl(locale),
          })),
        )}
      />

      <section className="border-b border-border bg-background-subtle">
        <div className="container-page py-8 lg:py-12">
          <Breadcrumbs items={breadcrumbs} className="mb-6" />

          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                {course.category ? (
                  <Badge tone="primary">{course.category.name}</Badge>
                ) : null}
                <Badge tone="neutral">{LEVEL_LABELS[course.level] ?? course.level}</Badge>
                {isEnrolled ? (
                  <Badge tone="success">
                    <CheckCircle2 className="size-3" aria-hidden="true" />
                    Enrolled
                  </Badge>
                ) : null}
              </div>

              <h1 className="text-3xl font-semibold tracking-tight text-text-primary sm:text-4xl lg:text-[2.75rem] lg:leading-tight">
                {course.title}
              </h1>

              {course.summary ? (
                <p className="max-w-2xl text-lg leading-relaxed text-text-secondary">
                  {course.summary}
                </p>
              ) : null}

              <dl className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-text-secondary">
                <div className="inline-flex items-center gap-1.5">
                  <dt className="sr-only">Lessons</dt>
                  <BookOpen className="size-4 text-text-muted" aria-hidden="true" />
                  <dd>
                    {totalLessons} {totalLessons === 1 ? 'lesson' : 'lessons'}
                  </dd>
                </div>
                {course.durationMinutes ? (
                  <div className="inline-flex items-center gap-1.5">
                    <dt className="sr-only">Duration</dt>
                    <Clock className="size-4 text-text-muted" aria-hidden="true" />
                    <dd>{formatDuration(course.durationMinutes)}</dd>
                  </div>
                ) : null}
                <div className="inline-flex items-center gap-1.5">
                  <dt className="sr-only">Level</dt>
                  <Signal className="size-4 text-text-muted" aria-hidden="true" />
                  <dd>{LEVEL_LABELS[course.level] ?? course.level}</dd>
                </div>
                <div className="inline-flex items-center gap-1.5">
                  <dt className="sr-only">Language</dt>
                  <Globe className="size-4 text-text-muted" aria-hidden="true" />
                  <dd className="uppercase">{course.language}</dd>
                </div>
                {course.enrollmentCount > 0 ? (
                  <div className="inline-flex items-center gap-1.5">
                    <dt className="sr-only">Learners</dt>
                    <Users className="size-4 text-text-muted" aria-hidden="true" />
                    <dd>{formatNumber(course.enrollmentCount, locale)} enrolled</dd>
                  </div>
                ) : null}
              </dl>

              {course.instructors.length > 0 ? (
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  {course.instructors.map((instructor) => (
                    <Link
                      key={instructor.id}
                      href={localePath(locale, `/instructors/${instructor.slug}`)}
                      className="inline-flex items-center gap-2 rounded-full border border-border bg-surface py-1 pl-1 pr-3.5 text-sm transition-colors hover:border-primary"
                    >
                      {instructor.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={instructor.avatarUrl}
                          alt=""
                          className="size-7 rounded-full object-cover"
                        />
                      ) : (
                        <span
                          className="grid size-7 place-items-center rounded-full text-2xs font-semibold text-white"
                          style={{ backgroundColor: colorFromString(instructor.slug) }}
                          aria-hidden="true"
                        >
                          {instructor.name.slice(0, 1)}
                        </span>
                      )}
                      <span className="text-text-secondary">{instructor.name}</span>
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>

            {/* Enrollment panel — sticky on desktop so the primary action is
                always reachable while scrolling a long curriculum. */}
            <aside className="lg:sticky lg:top-24 lg:self-start">
              <Card className="overflow-hidden">
                <div className="aspect-[16/9] bg-surface-sunken">
                  {course.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={course.thumbnailUrl}
                      alt=""
                      className="size-full object-cover"
                      loading="eager"
                    />
                  ) : (
                    <div
                      className="grid size-full place-items-center"
                      style={{
                        background: `linear-gradient(135deg, ${colorFromString(course.slug)}22, transparent)`,
                      }}
                      aria-hidden="true"
                    >
                      <PlayCircle
                        className="size-12"
                        style={{ color: colorFromString(course.slug) }}
                      />
                    </div>
                  )}
                </div>

                <div className="space-y-4 p-5">
                  <p className="text-2xl font-semibold text-text-primary">
                    {isPaid
                      ? formatPrice(course.priceCents ?? 0, course.currency ?? 'USD', locale)
                      : 'Free'}
                  </p>

                  {isEnrolled && course.viewer ? (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-text-muted">Your progress</span>
                        <span className="font-semibold text-text-primary">
                          {course.viewer.progressPercent}%
                        </span>
                      </div>
                      <ProgressBar value={course.viewer.progressPercent} />
                    </div>
                  ) : null}

                  <EnrollButton
                    courseId={course.id}
                    courseSlug={course.slug}
                    locale={locale}
                    isEnrolled={isEnrolled}
                    accessType={course.accessType}
                    resumeLessonSlug={resumeLesson?.slug ?? null}
                    progressPercent={course.viewer?.progressPercent ?? 0}
                  />

                  <ul className="space-y-2 border-t border-border pt-4 text-sm text-text-secondary">
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden="true" />
                      Lifetime access
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden="true" />
                      Progress saved to your account
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden="true" />
                      Learn at your own pace
                    </li>
                  </ul>
                </div>
              </Card>
            </aside>
          </div>
        </div>
      </section>

      <section className="py-12 lg:py-16">
        <div className="container-page">
          <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="space-y-12">
              {course.learningOutcomes.length > 0 ? (
                <section aria-labelledby="outcomes-heading">
                  <h2
                    id="outcomes-heading"
                    className="text-xl font-semibold text-text-primary sm:text-2xl"
                  >
                    What you will learn
                  </h2>
                  <ul className="mt-5 grid gap-3 sm:grid-cols-2">
                    {course.learningOutcomes.map((outcome) => (
                      <li key={outcome} className="flex gap-2.5 text-[0.9375rem] text-text-secondary">
                        <CheckCircle2
                          className="mt-0.5 size-4.5 shrink-0 text-success"
                          aria-hidden="true"
                        />
                        {outcome}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <section aria-labelledby="curriculum-heading">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2
                    id="curriculum-heading"
                    className="text-xl font-semibold text-text-primary sm:text-2xl"
                  >
                    Curriculum
                  </h2>
                  <p className="text-sm text-text-muted">
                    {course.modules.length} {course.modules.length === 1 ? 'module' : 'modules'} ·{' '}
                    {totalLessons} {totalLessons === 1 ? 'lesson' : 'lessons'}
                  </p>
                </div>
                <CourseCurriculum
                  modules={course.modules}
                  courseSlug={course.slug}
                  locale={locale}
                  isEnrolled={isEnrolled}
                  className="mt-5"
                />
              </section>

              {course.description ? (
                <section aria-labelledby="about-heading">
                  <h2
                    id="about-heading"
                    className="mb-5 text-xl font-semibold text-text-primary sm:text-2xl"
                  >
                    About this course
                  </h2>
                  <RichText document={course.description} />
                </section>
              ) : null}

              {course.requirements.length > 0 ? (
                <section aria-labelledby="requirements-heading">
                  <h2
                    id="requirements-heading"
                    className="text-xl font-semibold text-text-primary sm:text-2xl"
                  >
                    Requirements
                  </h2>
                  <ul className="mt-5 space-y-2.5">
                    {course.requirements.map((requirement) => (
                      <li
                        key={requirement}
                        className="flex gap-2.5 text-[0.9375rem] text-text-secondary"
                      >
                        <ChevronRight
                          className="mt-0.5 size-4 shrink-0 text-accent"
                          aria-hidden="true"
                        />
                        {requirement}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>

            <aside className="space-y-5">
              {course.tags.length > 0 ? (
                <Card>
                  <div className="p-5">
                    <h2 className="text-sm font-semibold text-text-primary">Topics</h2>
                    <ul className="mt-3 flex flex-wrap gap-2">
                      {course.tags.map((tag) => (
                        <li key={tag}>
                          <Link
                            href={localePath(
                              locale,
                              `/courses?tag=${encodeURIComponent(tag.toLowerCase().replace(/\s+/g, '-'))}`,
                            )}
                            className="inline-flex rounded-full border border-border px-3 py-1 text-xs text-text-secondary transition-colors hover:border-primary hover:text-primary"
                          >
                            {tag}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                </Card>
              ) : null}
            </aside>
          </div>
        </div>
      </section>
    </>
  );
}
