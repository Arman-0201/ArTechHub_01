import Link from 'next/link';
import * as Icons from 'lucide-react';
import { ArrowRight, Quote } from 'lucide-react';
import type { RichTextDocument } from '@academy/types';
import { cn, colorFromString, formatDate } from '@/lib/utils';
import { localePath } from '@/lib/i18n/config';
import { Button, SectionHeading } from '@/components/ui';
import { RichText } from '@/components/content/rich-text';
import { CourseCardGrid } from '@/components/courses/course-card';
import { NewsletterSection } from './newsletter-section';
import { FaqSection } from './faq-section';
import {
  readAction,
  readArray,
  readNumber,
  readOptionalString,
  readString,
  type SectionProps,
} from './types';

/**
 * Section components.
 *
 * Each one is a pure function of `(settings, content, data)`. They are Server
 * Components except where interaction demands otherwise (FAQ accordion,
 * newsletter form), which keeps the marketing pages almost entirely free of
 * client JavaScript.
 */

/** Resolves an admin-chosen icon name to a Lucide component, safely. */
function resolveIcon(name: string | undefined) {
  if (!name) return null;
  const candidate = (Icons as unknown as Record<string, unknown>)[name];
  // The icon name comes from the CMS, so it is validated as a real component
  // before being rendered rather than trusted.
  return typeof candidate === 'function' ? (candidate as typeof ArrowRight) : null;
}

const BACKGROUND_CLASSES: Record<string, string> = {
  default: 'bg-background',
  subtle: 'bg-background-subtle',
  surface: 'bg-surface',
  primary: 'bg-ink-900 text-white',
  gradient:
    'bg-[radial-gradient(ellipse_at_top,var(--color-primary-soft),transparent_65%)] bg-background',
};

function SectionShell({
  background,
  className,
  children,
  compact,
}: {
  background?: string;
  className?: string;
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <section
      className={cn(
        BACKGROUND_CLASSES[background ?? 'default'] ?? BACKGROUND_CLASSES.default,
        compact ? 'py-10 sm:py-14' : 'py-14 sm:py-20',
        className,
      )}
    >
      <div className="container-page">{children}</div>
    </section>
  );
}

/* ------------------------------------------------------------------- hero */

export function HeroSection({ section, locale }: SectionProps) {
  const { content, settings } = section;
  const align = readString(settings, 'align', 'left');
  const background = readString(settings, 'background', 'gradient');
  const isCompact = readString(settings, 'size') === 'compact';

  const primary = readAction(content, 'primaryAction');
  const secondary = readAction(content, 'secondaryAction');
  const highlights = readArray<string>(content, 'highlights');

  return (
    <SectionShell background={background} compact={isCompact} className="overflow-hidden">
      <div
        className={cn(
          'flex flex-col gap-7',
          align === 'center' ? 'mx-auto max-w-3xl text-center items-center' : 'max-w-3xl',
        )}
      >
        {readOptionalString(content, 'eyebrow') ? (
          <p className="inline-flex w-fit items-center rounded-full border border-border bg-surface px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-primary">
            {readString(content, 'eyebrow')}
          </p>
        ) : null}

        <h1
          className={cn(
            'font-semibold tracking-tight text-text-primary',
            isCompact ? 'text-3xl sm:text-4xl' : 'text-4xl sm:text-5xl lg:text-[3.5rem] lg:leading-[1.05]',
          )}
        >
          {readString(content, 'title')}
        </h1>

        {readOptionalString(content, 'description') ? (
          <p className="max-w-2xl text-lg leading-relaxed text-text-secondary">
            {readString(content, 'description')}
          </p>
        ) : null}

        {primary || secondary ? (
          <div className={cn('flex flex-wrap gap-3', align === 'center' && 'justify-center')}>
            {primary ? (
              <Button href={localePath(locale, primary.href)} size="lg">
                {primary.label}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Button>
            ) : null}
            {secondary ? (
              <Button href={localePath(locale, secondary.href)} variant="outline" size="lg">
                {secondary.label}
              </Button>
            ) : null}
          </div>
        ) : null}

        {highlights.length > 0 ? (
          <ul
            className={cn(
              'flex flex-wrap gap-x-6 gap-y-2 text-sm text-text-muted',
              align === 'center' && 'justify-center',
            )}
          >
            {highlights.map((highlight) => (
              <li key={highlight} className="inline-flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-accent" aria-hidden="true" />
                {highlight}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </SectionShell>
  );
}

/* ------------------------------------------------------------------- text */

export function TextSection({ section }: SectionProps) {
  const { content, settings } = section;
  const align = readString(settings, 'align', 'left');

  return (
    <SectionShell background={readString(settings, 'background', 'default')} compact>
      <div className={cn('container-prose space-y-3', align === 'center' && 'text-center')}>
        {readOptionalString(content, 'title') ? (
          <h2 className="text-2xl font-semibold text-text-primary sm:text-3xl">
            {readString(content, 'title')}
          </h2>
        ) : null}
        {readOptionalString(content, 'description') ? (
          <p className="text-lg leading-relaxed text-text-secondary">
            {readString(content, 'description')}
          </p>
        ) : null}
      </div>
    </SectionShell>
  );
}

export function RichTextSection({ section }: SectionProps) {
  const body = section.content.body as RichTextDocument | undefined;
  return (
    <SectionShell background={readString(section.settings, 'background', 'default')} compact>
      <div className="container-prose">
        <RichText document={body ?? null} />
      </div>
    </SectionShell>
  );
}

/**
 * Pre-sanitised HTML from the CMS.
 *
 * The markup was run through the server's allowlist sanitiser before it was
 * stored, which is why rendering it here is acceptable. This is the only place
 * in the app that uses `dangerouslySetInnerHTML`, and it exists solely for the
 * HTML section type.
 */
export function HtmlSection({ section }: SectionProps) {
  const html = readString(section.content, 'html');
  if (!html) return null;

  return (
    <SectionShell background={readString(section.settings, 'background', 'default')} compact>
      <div
        className="container-prose prose-reading"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </SectionShell>
  );
}

/* ------------------------------------------------------------------ image */

export function ImageSection({ section }: SectionProps) {
  const src = readOptionalString(section.content, 'src');
  if (!src) return null;

  return (
    <SectionShell background={readString(section.settings, 'background', 'default')} compact>
      <figure className="container-prose">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={readString(section.content, 'alt')}
          className="w-full rounded-2xl border border-border"
          loading="lazy"
        />
        {readOptionalString(section.content, 'caption') ? (
          <figcaption className="mt-3 text-center text-sm text-text-muted">
            {readString(section.content, 'caption')}
          </figcaption>
        ) : null}
      </figure>
    </SectionShell>
  );
}

export function ImageTextSection({ section, locale }: SectionProps) {
  const { content, settings } = section;
  const src = readOptionalString(content, 'src');
  const reversed = readString(settings, 'imagePosition', 'left') === 'right';
  const action = readAction(content, 'action');

  return (
    <SectionShell background={readString(settings, 'background', 'default')}>
      <div className="grid items-center gap-10 lg:grid-cols-2">
        {src ? (
          <div className={cn(reversed && 'lg:order-2')}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={readString(content, 'alt')}
              className="w-full rounded-2xl border border-border"
              loading="lazy"
            />
          </div>
        ) : null}

        <div className={cn('space-y-4', reversed && 'lg:order-1')}>
          {readOptionalString(content, 'eyebrow') ? (
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
              {readString(content, 'eyebrow')}
            </p>
          ) : null}
          <h2 className="text-2xl font-semibold text-text-primary sm:text-3xl">
            {readString(content, 'title')}
          </h2>
          <p className="text-base leading-relaxed text-text-secondary">
            {readString(content, 'description')}
          </p>
          {action ? (
            <Button href={localePath(locale, action.href)} variant="outline">
              {action.label}
            </Button>
          ) : null}
        </div>
      </div>
    </SectionShell>
  );
}

/* ---------------------------------------------------------------- feature */

interface FeatureItem {
  icon?: string;
  title: string;
  description: string;
}

export function FeatureGridSection({ section }: SectionProps) {
  const items = readArray<FeatureItem>(section.content, 'items');
  const columns = readNumber(section.settings, 'columns', 3);

  if (items.length === 0) return null;

  return (
    <SectionShell background={readString(section.settings, 'background', 'subtle')}>
      {readOptionalString(section.content, 'title') ? (
        <SectionHeading
          title={readString(section.content, 'title')}
          description={readOptionalString(section.content, 'description')}
          align="center"
          className="mb-10"
        />
      ) : null}

      <div
        className={cn(
          'grid gap-5',
          columns === 2 ? 'sm:grid-cols-2' : columns === 4 ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-2 lg:grid-cols-3',
        )}
      >
        {items.map((item, index) => {
          const Icon = resolveIcon(item.icon);
          return (
            <div
              key={`${item.title}-${index}`}
              className="rounded-xl border border-border bg-surface p-6 transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-accent"
            >
              {Icon ? (
                <span
                  className="mb-4 grid size-11 place-items-center rounded-lg bg-primary-soft text-primary"
                  aria-hidden="true"
                >
                  <Icon className="size-5" />
                </span>
              ) : null}
              <h3 className="text-base font-semibold text-text-primary">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-text-secondary">{item.description}</p>
            </div>
          );
        })}
      </div>
    </SectionShell>
  );
}

/* ------------------------------------------------------------------ stats */

export function StatsSection({ section }: SectionProps) {
  const items = readArray<{ value: string; label: string }>(section.content, 'items');
  if (items.length === 0) return null;

  return (
    <SectionShell background={readString(section.settings, 'background', 'default')} compact>
      {readOptionalString(section.content, 'title') ? (
        <h2 className="mb-8 text-center text-2xl font-semibold text-text-primary">
          {readString(section.content, 'title')}
        </h2>
      ) : null}

      <dl className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
        {items.map((item) => (
          <div key={item.label} className="bg-surface px-6 py-8 text-center">
            <dt className="order-2 mt-1.5 text-sm text-text-muted">{item.label}</dt>
            <dd className="order-1 text-3xl font-semibold tracking-tight text-primary sm:text-4xl">
              {item.value}
            </dd>
          </div>
        ))}
      </dl>
    </SectionShell>
  );
}

/* ---------------------------------------------------------------- courses */

export function CourseGridSection({ section, locale, data }: SectionProps) {
  const limit = readNumber(section.settings, 'limit', 6);
  const columns = readNumber(section.settings, 'columns', 3) as 2 | 3 | 4;
  const action = readAction(section.content, 'action');
  const courses = data.featuredCourses.slice(0, limit);

  if (courses.length === 0) return null;

  return (
    <SectionShell background={readString(section.settings, 'background', 'default')}>
      <SectionHeading
        title={readString(section.content, 'title', 'Courses')}
        description={readOptionalString(section.content, 'description')}
        action={
          action ? (
            <Button href={localePath(locale, action.href)} variant="outline" size="sm">
              {action.label}
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Button>
          ) : undefined
        }
        className="mb-8"
      />
      <CourseCardGrid courses={courses} locale={locale} columns={columns} />
    </SectionShell>
  );
}

/* ------------------------------------------------------------- categories */

export function CategoryGridSection({ section, locale, data }: SectionProps) {
  const limit = readNumber(section.settings, 'limit', 8);
  const categories = data.categories.slice(0, limit);
  if (categories.length === 0) return null;

  return (
    <SectionShell background={readString(section.settings, 'background', 'subtle')}>
      <SectionHeading
        title={readString(section.content, 'title', 'Browse by track')}
        description={readOptionalString(section.content, 'description')}
        className="mb-8"
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {categories.map((category) => {
          const Icon = resolveIcon(category.iconName ?? undefined);
          const accent = category.colorHex ?? colorFromString(category.slug);
          return (
            <Link
              key={category.id}
              href={localePath(locale, `/categories/${category.slug}`)}
              className="group flex flex-col gap-3 rounded-xl border border-border bg-surface p-5 transition-[border-color,transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-accent hover:shadow-raised"
            >
              <span
                className="grid size-11 place-items-center rounded-lg"
                style={{ backgroundColor: `${accent}1a`, color: accent }}
                aria-hidden="true"
              >
                {Icon ? <Icon className="size-5" /> : <Icons.Layers className="size-5" />}
              </span>
              <div className="space-y-1">
                <h3 className="font-semibold text-text-primary group-hover:text-primary">
                  {category.name}
                </h3>
                {category.description ? (
                  <p className="line-clamp-2 text-sm text-text-secondary">{category.description}</p>
                ) : null}
              </div>
              <p className="mt-auto text-xs text-text-muted">
                {category.courseCount} {category.courseCount === 1 ? 'course' : 'courses'}
              </p>
            </Link>
          );
        })}
      </div>
    </SectionShell>
  );
}

/* ----------------------------------------------------------- testimonials */

export function TestimonialsSection({ section }: SectionProps) {
  const items = readArray<{ quote: string; author: string; role?: string; avatar?: string }>(
    section.content,
    'items',
  );
  if (items.length === 0) return null;

  return (
    <SectionShell background={readString(section.settings, 'background', 'default')}>
      <SectionHeading
        title={readString(section.content, 'title', 'What learners say')}
        align="center"
        className="mb-10"
      />

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item, index) => (
          <figure
            key={`${item.author}-${index}`}
            className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-6"
          >
            <Quote className="size-6 text-accent" aria-hidden="true" />
            <blockquote className="flex-1 text-[0.9375rem] leading-relaxed text-text-secondary">
              {item.quote}
            </blockquote>
            <figcaption className="flex items-center gap-3 border-t border-border pt-4">
              <span
                className="grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold text-white"
                style={{ backgroundColor: colorFromString(item.author) }}
                aria-hidden="true"
              >
                {item.author.slice(0, 1)}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-text-primary">
                  {item.author}
                </span>
                {item.role ? (
                  <span className="block truncate text-xs text-text-muted">{item.role}</span>
                ) : null}
              </span>
            </figcaption>
          </figure>
        ))}
      </div>
    </SectionShell>
  );
}

/* -------------------------------------------------------------------- CTA */

export function CtaSection({ section, locale }: SectionProps) {
  const primary = readAction(section.content, 'primaryAction');
  const secondary = readAction(section.content, 'secondaryAction');

  return (
    <section className="py-14 sm:py-20">
      <div className="container-page">
        <div className="relative overflow-hidden rounded-3xl bg-ink-900 px-6 py-14 text-center sm:px-12">
          <div
            className="pointer-events-none absolute inset-0 opacity-40"
            style={{
              background:
                'radial-gradient(ellipse at 20% 0%, rgba(118,146,255,0.35), transparent 55%), radial-gradient(ellipse at 80% 100%, rgba(171,210,250,0.2), transparent 55%)',
            }}
            aria-hidden="true"
          />
          <div className="relative mx-auto max-w-2xl space-y-5">
            <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              {readString(section.content, 'title')}
            </h2>
            {readOptionalString(section.content, 'description') ? (
              <p className="text-lg leading-relaxed text-ink-100">
                {readString(section.content, 'description')}
              </p>
            ) : null}
            <div className="flex flex-wrap justify-center gap-3 pt-2">
              {primary ? (
                <Button
                  href={localePath(locale, primary.href)}
                  size="lg"
                  className="bg-white text-ink-900 hover:bg-ink-50"
                >
                  {primary.label}
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Button>
              ) : null}
              {secondary ? (
                <Button
                  href={localePath(locale, secondary.href)}
                  size="lg"
                  variant="outline"
                  className="border-white/30 text-white hover:border-white hover:text-white"
                >
                  {secondary.label}
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ instructors */

export function InstructorListSection({ section, locale, data }: SectionProps) {
  const instructors = data.instructors.slice(0, readNumber(section.settings, 'limit', 6));
  if (instructors.length === 0) return null;

  return (
    <SectionShell background={readString(section.settings, 'background', 'subtle')}>
      <SectionHeading
        title={readString(section.content, 'title', 'Who teaches here')}
        description={readOptionalString(section.content, 'description')}
        className="mb-8"
      />

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {instructors.map((instructor) => (
          <Link
            key={instructor.id}
            href={localePath(locale, `/instructors/${instructor.slug}`)}
            className="group flex gap-4 rounded-xl border border-border bg-surface p-5 transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-accent"
          >
            {instructor.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={instructor.avatarUrl}
                alt=""
                className="size-14 shrink-0 rounded-full object-cover"
                loading="lazy"
              />
            ) : (
              <span
                className="grid size-14 shrink-0 place-items-center rounded-full text-lg font-semibold text-white"
                style={{ backgroundColor: colorFromString(instructor.slug) }}
                aria-hidden="true"
              >
                {instructor.name.slice(0, 1)}
              </span>
            )}
            <div className="min-w-0 space-y-1">
              <h3 className="font-semibold text-text-primary group-hover:text-primary">
                {instructor.name}
              </h3>
              {instructor.headline ? (
                <p className="line-clamp-2 text-sm text-text-secondary">{instructor.headline}</p>
              ) : null}
            </div>
          </Link>
        ))}
      </div>
    </SectionShell>
  );
}

/* ------------------------------------------------------------------- blog */

export function BlogGridSection({ section, locale, data }: SectionProps) {
  const posts = data.latestPosts.slice(0, readNumber(section.settings, 'limit', 3));
  if (posts.length === 0) return null;

  const action = readAction(section.content, 'action');

  return (
    <SectionShell background={readString(section.settings, 'background', 'default')}>
      <SectionHeading
        title={readString(section.content, 'title', 'Latest articles')}
        description={readOptionalString(section.content, 'description')}
        action={
          action ? (
            <Button href={localePath(locale, action.href)} variant="outline" size="sm">
              {action.label}
            </Button>
          ) : undefined
        }
        className="mb-8"
      />

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {posts.map((post) => (
          <article
            key={post.id}
            className="group relative flex flex-col overflow-hidden rounded-xl border border-border bg-surface transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-accent"
          >
            {post.coverImageUrl ? (
              <div className="aspect-[16/9] overflow-hidden bg-surface-sunken">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={post.coverImageUrl}
                  alt=""
                  className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                  loading="lazy"
                />
              </div>
            ) : null}
            <div className="flex flex-1 flex-col gap-2 p-5">
              <h3 className="font-semibold leading-snug text-text-primary">
                <Link
                  href={localePath(locale, `/blog/${post.slug}`)}
                  className="after:absolute after:inset-0 after:content-['']"
                >
                  {post.title}
                </Link>
              </h3>
              {post.excerpt ? (
                <p className="line-clamp-3 text-sm leading-relaxed text-text-secondary">
                  {post.excerpt}
                </p>
              ) : null}
              <p className="mt-auto pt-2 text-xs text-text-muted">
                {post.publishedAt ? formatDate(post.publishedAt, locale) : null}
                {post.publishedAt ? ' · ' : null}
                {post.readingMinutes} min read
              </p>
            </div>
          </article>
        ))}
      </div>
    </SectionShell>
  );
}

/* ------------------------------------------------------------------ video */

export function VideoSection({ section }: SectionProps) {
  const src = readOptionalString(section.content, 'src');
  if (!src) return null;

  const isEmbed = /youtube|vimeo/i.test(src);

  return (
    <SectionShell background={readString(section.settings, 'background', 'default')} compact>
      <div className="container-prose space-y-4">
        {readOptionalString(section.content, 'title') ? (
          <h2 className="text-center text-2xl font-semibold text-text-primary">
            {readString(section.content, 'title')}
          </h2>
        ) : null}
        <div className="overflow-hidden rounded-2xl border border-border bg-ink-950">
          {isEmbed ? (
            <iframe
              src={src}
              title={readString(section.content, 'title', 'Video')}
              className="aspect-video w-full"
              allow="accelerometer; clipboard-write; encrypted-media; picture-in-picture"
              allowFullScreen
              loading="lazy"
            />
          ) : (
            <video
              src={src}
              poster={readOptionalString(section.content, 'poster')}
              controls
              preload="metadata"
              className="aspect-video w-full"
            />
          )}
        </div>
      </div>
    </SectionShell>
  );
}

/* ------------------------------------------------------------------- team */

export function TeamSection({ section }: SectionProps) {
  const members = readArray<{ name: string; role?: string; avatar?: string; bio?: string }>(
    section.content,
    'items',
  );
  if (members.length === 0) return null;

  return (
    <SectionShell background={readString(section.settings, 'background', 'default')}>
      <SectionHeading
        title={readString(section.content, 'title', 'Our team')}
        align="center"
        className="mb-10"
      />
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {members.map((member, index) => (
          <div
            key={`${member.name}-${index}`}
            className="flex flex-col items-center gap-3 rounded-xl border border-border bg-surface p-6 text-center"
          >
            {member.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={member.avatar} alt="" className="size-16 rounded-full object-cover" loading="lazy" />
            ) : (
              <span
                className="grid size-16 place-items-center rounded-full text-xl font-semibold text-white"
                style={{ backgroundColor: colorFromString(member.name) }}
                aria-hidden="true"
              >
                {member.name.slice(0, 1)}
              </span>
            )}
            <div>
              <p className="font-semibold text-text-primary">{member.name}</p>
              {member.role ? <p className="text-sm text-text-muted">{member.role}</p> : null}
            </div>
            {member.bio ? <p className="text-sm text-text-secondary">{member.bio}</p> : null}
          </div>
        ))}
      </div>
    </SectionShell>
  );
}

/* ------------------------------------------------------- logos / carousel */

export function LogoCarouselSection({ section }: SectionProps) {
  const logos = readArray<{ src: string; alt?: string }>(section.content, 'items');
  if (logos.length === 0) return null;

  return (
    <SectionShell background={readString(section.settings, 'background', 'subtle')} compact>
      {readOptionalString(section.content, 'title') ? (
        <p className="mb-8 text-center text-sm font-medium uppercase tracking-widest text-text-muted">
          {readString(section.content, 'title')}
        </p>
      ) : null}
      <ul className="flex flex-wrap items-center justify-center gap-x-12 gap-y-8">
        {logos.map((logo, index) => (
          <li key={`${logo.src}-${index}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logo.src}
              alt={logo.alt ?? ''}
              className="h-8 w-auto opacity-60 grayscale transition-[opacity,filter] duration-200 hover:opacity-100 hover:grayscale-0"
              loading="lazy"
            />
          </li>
        ))}
      </ul>
    </SectionShell>
  );
}

export { NewsletterSection, FaqSection, SectionShell };
