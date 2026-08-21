'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, ChevronDown, Circle, Lock, X } from 'lucide-react';
import type { CourseDetailDto } from '@academy/types';
import { cn, formatDuration } from '@/lib/utils';
import { localePath } from '@/lib/i18n/config';
import { ProgressBar } from '@/components/ui';

/**
 * Curriculum sidebar.
 *
 * Sticky on desktop, an overlay drawer on mobile. The module containing the
 * current lesson opens automatically, so a learner arriving from a link always
 * sees where they are in the course rather than a wall of collapsed modules.
 */
export function LessonSidebar({
  course,
  currentLessonId,
  completedLessonIds,
  progressPercent,
  locale,
  isOpen,
  onClose,
}: {
  course: CourseDetailDto;
  currentLessonId: string;
  completedLessonIds: Set<string>;
  progressPercent: number;
  locale: string;
  isOpen: boolean;
  onClose: () => void;
}) {
  const currentModuleId = course.modules.find((module) =>
    module.lessons.some((lesson) => lesson.id === currentLessonId),
  )?.id;

  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(currentModuleId ? [currentModuleId] : []),
  );

  // Navigating to a lesson in a collapsed module must reveal it.
  useEffect(() => {
    if (!currentModuleId) return;
    setExpanded((previous) => {
      if (previous.has(currentModuleId)) return previous;
      const next = new Set(previous);
      next.add(currentModuleId);
      return next;
    });
  }, [currentModuleId]);

  const totalLessons = course.modules.reduce((total, module) => total + module.lessons.length, 0);
  const completedCount = completedLessonIds.size;

  return (
    <>
      {/* Mobile scrim. Hidden from assistive tech — the close button in the
          drawer header is the labelled control. */}
      {isOpen ? (
        <button
          type="button"
          onClick={onClose}
          className="fixed inset-0 z-30 bg-[var(--color-overlay)] lg:hidden"
          aria-hidden="true"
          tabIndex={-1}
        />
      ) : null}

      <aside
        className={cn(
          'z-40 w-80 shrink-0 border-r border-border bg-surface',
          'fixed inset-y-0 left-0 transition-transform duration-300 ease-[cubic-bezier(0.25,1,0.5,1)]',
          'lg:sticky lg:top-[var(--header-height)] lg:h-[calc(100dvh-var(--header-height))] lg:translate-x-0',
          isOpen ? 'translate-x-0' : '-translate-x-full lg:hidden',
        )}
        aria-label="Course curriculum"
      >
        <div className="flex h-full flex-col">
          <div className="border-b border-border p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link
                  href={localePath(locale, `/courses/${course.slug}`)}
                  className="line-clamp-2 text-sm font-semibold text-text-primary transition-colors hover:text-primary"
                >
                  {course.title}
                </Link>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="grid size-8 shrink-0 place-items-center rounded-md text-text-muted transition-colors hover:bg-surface-sunken lg:hidden"
                aria-label="Close curriculum"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-4 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-text-muted">
                  {completedCount} of {totalLessons} lessons
                </span>
                <span className="font-semibold text-text-primary">{progressPercent}%</span>
              </div>
              <ProgressBar value={progressPercent} size="sm" />
            </div>
          </div>

          <nav className="flex-1 overflow-y-auto p-2">
            <ul className="space-y-1">
              {course.modules.map((module, moduleIndex) => {
                const isExpanded = expanded.has(module.id);
                const panelId = `sidebar-module-${module.id}`;
                const moduleCompleted = module.lessons.filter((lesson) =>
                  completedLessonIds.has(lesson.id),
                ).length;

                return (
                  <li key={module.id}>
                    <button
                      type="button"
                      aria-expanded={isExpanded}
                      aria-controls={panelId}
                      onClick={() =>
                        setExpanded((previous) => {
                          const next = new Set(previous);
                          if (next.has(module.id)) next.delete(module.id);
                          else next.add(module.id);
                          return next;
                        })
                      }
                      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-surface-sunken"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-2xs font-semibold uppercase tracking-wider text-text-muted">
                          Module {moduleIndex + 1}
                        </span>
                        <span className="block truncate text-sm font-medium text-text-primary">
                          {module.title}
                        </span>
                      </span>
                      <span className="shrink-0 text-2xs text-text-muted">
                        {moduleCompleted}/{module.lessons.length}
                      </span>
                      <ChevronDown
                        className={cn(
                          'size-3.5 shrink-0 text-text-muted transition-transform duration-200',
                          isExpanded && 'rotate-180',
                        )}
                        aria-hidden="true"
                      />
                    </button>

                    <ul id={panelId} hidden={!isExpanded} className="mt-0.5 space-y-0.5 pl-2">
                      {module.lessons.map((lesson) => {
                        const isCurrent = lesson.id === currentLessonId;
                        const isDone = completedLessonIds.has(lesson.id);
                        const isLocked =
                          !(course.viewer?.isEnrolled ?? false) && !lesson.isPreview;

                        const content = (
                          <>
                            {isDone ? (
                              <Check
                                className="size-4 shrink-0 text-success"
                                aria-hidden="true"
                              />
                            ) : isLocked ? (
                              <Lock className="size-3.5 shrink-0 text-text-muted" aria-hidden="true" />
                            ) : (
                              <Circle
                                className={cn(
                                  'size-3.5 shrink-0',
                                  isCurrent ? 'text-primary' : 'text-text-muted',
                                )}
                                aria-hidden="true"
                              />
                            )}
                            <span className="min-w-0 flex-1 truncate">{lesson.title}</span>
                            {lesson.durationMinutes ? (
                              <span className="shrink-0 text-2xs text-text-muted">
                                {formatDuration(lesson.durationMinutes)}
                              </span>
                            ) : null}
                          </>
                        );

                        const rowClasses = cn(
                          'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
                          isCurrent
                            ? 'bg-primary-soft font-medium text-primary'
                            : isLocked
                              ? 'text-text-muted'
                              : 'text-text-secondary hover:bg-surface-sunken hover:text-text-primary',
                        );

                        return (
                          <li key={lesson.id}>
                            {isLocked ? (
                              <div className={rowClasses}>{content}</div>
                            ) : (
                              <Link
                                href={localePath(
                                  locale,
                                  `/learn/${course.slug}/${lesson.slug}`,
                                )}
                                className={rowClasses}
                                aria-current={isCurrent ? 'page' : undefined}
                              >
                                {content}
                              </Link>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      </aside>
    </>
  );
}
