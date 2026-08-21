import Link from 'next/link';
import { BookOpen, Clock, Signal, Users } from 'lucide-react';
import type { CourseCardDto } from '@academy/types';
import { cn, colorFromString, formatDuration, formatNumber, formatPrice } from '@/lib/utils';
import { localePath } from '@/lib/i18n/config';
import { Badge, ProgressBar } from '@/components/ui';

const LEVEL_LABELS: Record<string, string> = {
  BEGINNER: 'Beginner',
  INTERMEDIATE: 'Intermediate',
  ADVANCED: 'Advanced',
  EXPERT: 'Expert',
};

/**
 * Course card.
 *
 * A Server Component — it has no interactivity beyond the link, so shipping
 * JavaScript for it would be waste. When `progress` is supplied it renders the
 * "continue" variant used on the dashboard.
 */
export function CourseCard({
  course,
  locale,
  progressPercent,
  className,
  href,
}: {
  course: CourseCardDto;
  locale: string;
  progressPercent?: number;
  className?: string;
  href?: string;
}) {
  const target = href ?? localePath(locale, `/courses/${course.slug}`);
  const isPaid = course.accessType === 'PAID' && course.priceCents;

  return (
    <article
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-xl border border-border bg-surface',
        'transition-[border-color,box-shadow,transform] duration-200',
        'hover:-translate-y-0.5 hover:border-accent hover:shadow-raised',
        className,
      )}
    >
      <div className="relative aspect-[16/9] overflow-hidden bg-surface-sunken">
        {course.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={course.thumbnailUrl}
            alt=""
            className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            loading="lazy"
            decoding="async"
          />
        ) : (
          // Deterministic placeholder so a card without art still looks
          // intentional and is distinguishable from its neighbours.
          <div
            className="grid size-full place-items-center"
            style={{
              background: `linear-gradient(135deg, ${colorFromString(course.slug)}22, ${colorFromString(course.slug)}0a)`,
            }}
            aria-hidden="true"
          >
            <BookOpen className="size-9" style={{ color: colorFromString(course.slug) }} />
          </div>
        )}

        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          {course.isFeatured ? <Badge tone="primary">Featured</Badge> : null}
          {course.status !== 'PUBLISHED' ? (
            <Badge tone="warning">{course.status.toLowerCase()}</Badge>
          ) : null}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-5">
        {course.category ? (
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">
            {course.category.name}
          </p>
        ) : null}

        <h3 className="text-base font-semibold leading-snug text-text-primary">
          {/* The whole card is clickable via this stretched link, which keeps a
              single, correctly-labelled tab stop instead of several. */}
          <Link href={target} className="after:absolute after:inset-0 after:content-['']">
            {course.title}
          </Link>
        </h3>

        {course.summary ? (
          <p className="line-clamp-2 text-sm leading-relaxed text-text-secondary">
            {course.summary}
          </p>
        ) : null}

        {progressPercent !== undefined ? (
          <div className="mt-auto space-y-1.5 pt-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-text-muted">Progress</span>
              <span className="font-semibold text-text-primary">{Math.round(progressPercent)}%</span>
            </div>
            <ProgressBar value={progressPercent} size="sm" />
          </div>
        ) : (
          <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-2 text-xs text-text-muted">
            <span className="inline-flex items-center gap-1.5">
              <Signal className="size-3.5" aria-hidden="true" />
              {LEVEL_LABELS[course.level] ?? course.level}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <BookOpen className="size-3.5" aria-hidden="true" />
              {course.lessonCount} lessons
            </span>
            {course.durationMinutes ? (
              <span className="inline-flex items-center gap-1.5">
                <Clock className="size-3.5" aria-hidden="true" />
                {formatDuration(course.durationMinutes)}
              </span>
            ) : null}
            {course.enrollmentCount > 0 ? (
              <span className="inline-flex items-center gap-1.5">
                <Users className="size-3.5" aria-hidden="true" />
                {formatNumber(course.enrollmentCount, locale)}
              </span>
            ) : null}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-border px-5 py-3">
        <span className="text-sm font-semibold text-text-primary">
          {isPaid
            ? formatPrice(course.priceCents ?? 0, course.currency ?? 'USD', locale)
            : 'Free'}
        </span>
        {course.instructors.length > 0 ? (
          <span className="truncate text-xs text-text-muted">
            {course.instructors[0]?.name}
            {course.instructors.length > 1 ? ` +${course.instructors.length - 1}` : ''}
          </span>
        ) : null}
      </div>
    </article>
  );
}

export function CourseCardGrid({
  courses,
  locale,
  columns = 3,
  className,
}: {
  courses: CourseCardDto[];
  locale: string;
  columns?: 2 | 3 | 4;
  className?: string;
}) {
  const columnClass = {
    2: 'sm:grid-cols-2',
    3: 'sm:grid-cols-2 lg:grid-cols-3',
    4: 'sm:grid-cols-2 lg:grid-cols-4',
  }[columns];

  return (
    <div className={cn('grid gap-5', columnClass, className)}>
      {courses.map((course) => (
        <CourseCard key={course.id} course={course} locale={locale} />
      ))}
    </div>
  );
}
