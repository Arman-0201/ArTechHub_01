'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Download,
  FileText,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import type { CourseDetailDto, LessonDetailDto } from '@academy/types';
import { api } from '@/lib/api/client';
import { cn, formatDuration } from '@/lib/utils';
import { localePath } from '@/lib/i18n/config';
import { Button, ProgressBar } from '@/components/ui';
import { RichText } from '@/components/content/rich-text';
import { PdfReader } from '@/components/content/pdf-reader';
import { LessonSidebar } from './lesson-sidebar';

/**
 * Learning interface.
 *
 * Layout: a persistent curriculum sidebar plus the lesson body, which is
 * rendered with the reading typography rather than as a document viewer.
 *
 * Progress is server-authoritative. The completion toggle updates optimistically
 * so the interaction feels instant, then reconciles with the server's response —
 * and reverts if the write fails, so the UI never claims progress that was not
 * recorded.
 */
export function LearnShell({
  lesson,
  course,
  locale,
  isSignedIn,
  isEnrolled,
}: {
  lesson: LessonDetailDto;
  course: CourseDetailDto;
  locale: string;
  isSignedIn: boolean;
  isEnrolled: boolean;
}) {
  const router = useRouter();

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isCompleted, setIsCompleted] = useState(lesson.progress?.isCompleted ?? false);
  const [isSaving, setIsSaving] = useState(false);
  const [completedLessonIds, setCompletedLessonIds] = useState<Set<string>>(new Set());
  const [progressPercent, setProgressPercent] = useState(course.viewer?.progressPercent ?? 0);

  // A different lesson means new progress state.
  useEffect(() => {
    setIsCompleted(lesson.progress?.isCompleted ?? false);
  }, [lesson.id, lesson.progress?.isCompleted]);

  // The sidebar's tick marks come from the server so they stay correct across
  // devices; `localStorage` would drift.
  useEffect(() => {
    if (!isEnrolled) return;
    let cancelled = false;

    api
      .get<{ completedLessonIds: string[]; progressPercent: number }>(
        `/account/courses/${course.id}/progress`,
      )
      .then((data) => {
        if (cancelled) return;
        setCompletedLessonIds(new Set(data.completedLessonIds));
        setProgressPercent(data.progressPercent);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [course.id, isEnrolled]);

  const orderedLessons = useMemo(
    () => course.modules.flatMap((module) => module.lessons),
    [course.modules],
  );

  const currentIndex = orderedLessons.findIndex((entry) => entry.id === lesson.id);
  const previousLesson = currentIndex > 0 ? orderedLessons[currentIndex - 1] : undefined;
  const nextLesson =
    currentIndex >= 0 && currentIndex < orderedLessons.length - 1
      ? orderedLessons[currentIndex + 1]
      : undefined;

  const toggleComplete = useCallback(
    async (markComplete: boolean) => {
      if (!isEnrolled) return;

      // Optimistic: reflect the click immediately, reconcile below.
      const previousCompleted = isCompleted;
      const previousSet = completedLessonIds;
      setIsCompleted(markComplete);
      setCompletedLessonIds((current) => {
        const next = new Set(current);
        if (markComplete) next.add(lesson.id);
        else next.delete(lesson.id);
        return next;
      });
      setIsSaving(true);

      try {
        const result = await api.put<{
          lesson: { isCompleted: boolean };
          course: { progressPercent: number };
        }>(`/account/lessons/${lesson.id}/progress`, { isCompleted: markComplete });

        setIsCompleted(result.lesson.isCompleted);
        setProgressPercent(result.course.progressPercent);

        // Advance automatically on completion — the expected flow, and it keeps
        // the learner in the material rather than back at a menu.
        if (markComplete && nextLesson) {
          router.push(localePath(locale, `/learn/${course.slug}/${nextLesson.slug}`));
        }
      } catch {
        setIsCompleted(previousCompleted);
        setCompletedLessonIds(previousSet);
      } finally {
        setIsSaving(false);
      }
    },
    [isEnrolled, isCompleted, completedLessonIds, lesson.id, nextLesson, router, locale, course.slug],
  );

  return (
    <div className="flex min-h-[calc(100dvh-var(--header-height))]">
      <LessonSidebar
        course={course}
        currentLessonId={lesson.id}
        completedLessonIds={completedLessonIds}
        progressPercent={progressPercent}
        locale={locale}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      <div className="min-w-0 flex-1">
        <div className="sticky top-[var(--header-height)] z-20 flex items-center gap-3 border-b border-border bg-background/90 px-4 py-2.5 backdrop-blur-sm sm:px-6">
          <button
            type="button"
            onClick={() => setIsSidebarOpen((previous) => !previous)}
            className="grid size-9 place-items-center rounded-lg text-text-secondary transition-colors hover:bg-surface-sunken"
            aria-label={isSidebarOpen ? 'Hide curriculum' : 'Show curriculum'}
            aria-expanded={isSidebarOpen}
          >
            {isSidebarOpen ? (
              <PanelLeftClose className="size-4.5" aria-hidden="true" />
            ) : (
              <PanelLeftOpen className="size-4.5" aria-hidden="true" />
            )}
          </button>

          <Link
            href={localePath(locale, `/courses/${course.slug}`)}
            className="min-w-0 flex-1 truncate text-sm font-medium text-text-secondary transition-colors hover:text-primary"
          >
            {course.title}
          </Link>

          <div className="hidden items-center gap-3 sm:flex">
            <span className="text-xs text-text-muted">{progressPercent}% complete</span>
            <ProgressBar value={progressPercent} size="sm" className="w-28" />
          </div>
        </div>

        <article className="px-4 py-10 sm:px-6 lg:py-14">
          <div className="container-prose">
            <header className="mb-8 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
                {lesson.moduleTitle}
              </p>
              <h1 className="text-3xl font-semibold tracking-tight text-text-primary sm:text-4xl">
                {lesson.title}
              </h1>
              {lesson.summary ? (
                <p className="text-lg leading-relaxed text-text-secondary">{lesson.summary}</p>
              ) : null}
              {lesson.durationMinutes ? (
                <p className="text-sm text-text-muted">
                  {formatDuration(lesson.durationMinutes)} read
                </p>
              ) : null}
            </header>

            {lesson.video ? (
              <div className="mb-10 overflow-hidden rounded-xl border border-border bg-ink-950">
                {lesson.video.provider === 'file' ? (
                  <video
                    src={lesson.video.url}
                    poster={lesson.video.posterUrl ?? undefined}
                    controls
                    preload="metadata"
                    className="aspect-video w-full"
                  />
                ) : (
                  <iframe
                    src={lesson.video.url}
                    title={lesson.title}
                    className="aspect-video w-full"
                    allow="accelerometer; clipboard-write; encrypted-media; picture-in-picture"
                    allowFullScreen
                  />
                )}
              </div>
            ) : null}

            <RichText document={lesson.body} />

            {/*
              * The source document, read in place.
              *
              * Below the body rather than instead of it: the imported text is
              * the version that reads like the rest of the site, and the PDF is
              * what an admin will check it against or a learner will want when
              * a diagram did not survive the import. A lesson whose import
              * produced no body renders nothing above, so the reader lands
              * directly under the heading, which is the right place for a
              * lesson that *is* the document.
              *
              * `pdfReader` is null whenever the platform will not serve the
              * bytes — no source PDF, or the feature switched off in the admin
              * panel — so this is the flag check as well as the content check.
              */}
            {lesson.pdfReader ? (
              <section className="mt-10">
                <h2 className="mb-3 text-sm font-semibold text-text-primary">
                  Original document
                </h2>
                <PdfReader
                  pdf={lesson.pdfReader}
                  documentId={lesson.id}
                  downloadUrl={lesson.sourcePdfUrl}
                />
              </section>
            ) : null}

            {lesson.attachments.length > 0 || lesson.sourcePdfUrl ? (
              <section className="mt-12 rounded-xl border border-border bg-surface p-5">
                <h2 className="text-sm font-semibold text-text-primary">Resources</h2>
                <ul className="mt-3 space-y-2">
                  {lesson.sourcePdfUrl ? (
                    <li>
                      <a
                        href={lesson.sourcePdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-surface-sunken hover:text-primary"
                      >
                        <Download className="size-4 shrink-0" aria-hidden="true" />
                        Download the original PDF
                      </a>
                    </li>
                  ) : null}
                  {lesson.attachments.map((attachment) => (
                    <li key={attachment.id}>
                      <a
                        href={attachment.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-surface-sunken hover:text-primary"
                      >
                        <FileText className="size-4 shrink-0" aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate">{attachment.label}</span>
                        <span className="shrink-0 text-xs text-text-muted">
                          {Math.round(attachment.sizeBytes / 1024)} KB
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {isEnrolled ? (
              <div className="mt-12 flex flex-col items-center gap-4 border-t border-border pt-8">
                <Button
                  onClick={() => void toggleComplete(!isCompleted)}
                  isLoading={isSaving}
                  variant={isCompleted ? 'secondary' : 'primary'}
                  size="lg"
                  aria-pressed={isCompleted}
                >
                  {isCompleted ? (
                    <>
                      <Check className="size-4" aria-hidden="true" />
                      Completed
                    </>
                  ) : (
                    'Mark as complete'
                  )}
                </Button>
                {isCompleted && nextLesson ? (
                  <p className="text-sm text-text-muted">Next up: {nextLesson.title}</p>
                ) : null}
              </div>
            ) : isSignedIn ? (
              <div className="mt-12 rounded-xl border border-border bg-surface-sunken p-6 text-center">
                <p className="text-text-secondary">
                  You are reading a free preview. Enroll to unlock the full course and track your
                  progress.
                </p>
                <Button href={localePath(locale, `/courses/${course.slug}`)} className="mt-4">
                  Enroll in this course
                </Button>
              </div>
            ) : (
              <div className="mt-12 rounded-xl border border-border bg-surface-sunken p-6 text-center">
                <p className="text-text-secondary">
                  Sign in to enroll and keep your progress across devices.
                </p>
                <Button
                  href={localePath(locale, `/login?redirect=/learn/${course.slug}/${lesson.slug}`)}
                  className="mt-4"
                >
                  Sign in
                </Button>
              </div>
            )}

            <nav
              aria-label="Lesson navigation"
              className="mt-10 grid gap-3 border-t border-border pt-8 sm:grid-cols-2"
            >
              {previousLesson ? (
                <Link
                  href={localePath(locale, `/learn/${course.slug}/${previousLesson.slug}`)}
                  className="group flex items-center gap-3 rounded-xl border border-border p-4 transition-colors hover:border-primary"
                >
                  <ArrowLeft
                    className="size-4 shrink-0 text-text-muted transition-colors group-hover:text-primary"
                    aria-hidden="true"
                  />
                  <span className="min-w-0">
                    <span className="block text-xs text-text-muted">Previous</span>
                    <span className="block truncate text-sm font-medium text-text-primary">
                      {previousLesson.title}
                    </span>
                  </span>
                </Link>
              ) : (
                <div />
              )}

              {nextLesson ? (
                <Link
                  href={localePath(locale, `/learn/${course.slug}/${nextLesson.slug}`)}
                  className="group flex items-center justify-end gap-3 rounded-xl border border-border p-4 text-right transition-colors hover:border-primary"
                >
                  <span className="min-w-0">
                    <span className="block text-xs text-text-muted">Next</span>
                    <span className="block truncate text-sm font-medium text-text-primary">
                      {nextLesson.title}
                    </span>
                  </span>
                  <ArrowRight
                    className="size-4 shrink-0 text-text-muted transition-colors group-hover:text-primary"
                    aria-hidden="true"
                  />
                </Link>
              ) : (
                <div className="rounded-xl border border-dashed border-border p-4 text-right text-sm text-text-muted">
                  Last lesson in this course
                </div>
              )}
            </nav>
          </div>
        </article>
      </div>
    </div>
  );
}
