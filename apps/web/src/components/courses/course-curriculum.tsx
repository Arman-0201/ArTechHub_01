'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, FileText, Lock, PlayCircle, Sparkles } from 'lucide-react';
import type { ModuleSummaryDto } from '@academy/types';
import { cn, formatDuration } from '@/lib/utils';
import { localePath } from '@/lib/i18n/config';
import { Badge } from '@/components/ui';

const LESSON_ICONS = {
  VIDEO: PlayCircle,
  ARTICLE: FileText,
  PDF: FileText,
  QUIZ: Sparkles,
  RESOURCE: FileText,
} as const;

/**
 * Course curriculum accordion.
 *
 * Locked lessons render as inert rows rather than links. That is presentation
 * only — the lesson endpoint performs its own enrollment check, so removing the
 * lock in devtools gains nothing.
 */
export function CourseCurriculum({
  modules,
  courseSlug,
  locale,
  isEnrolled,
  className,
}: {
  modules: ModuleSummaryDto[];
  courseSlug: string;
  locale: string;
  isEnrolled: boolean;
  className?: string;
}) {
  // The first module opens by default so the page never starts fully collapsed.
  const [openModules, setOpenModules] = useState<Set<string>>(
    () => new Set(modules[0] ? [modules[0].id] : []),
  );

  function toggle(moduleId: string) {
    setOpenModules((previous) => {
      const next = new Set(previous);
      if (next.has(moduleId)) next.delete(moduleId);
      else next.add(moduleId);
      return next;
    });
  }

  if (modules.length === 0) {
    return (
      <p className={cn('text-sm text-text-muted', className)}>
        The curriculum for this course is being prepared.
      </p>
    );
  }

  return (
    <div className={cn('overflow-hidden rounded-xl border border-border', className)}>
      <ul className="divide-y divide-border">
        {modules.map((module, moduleIndex) => {
          const isOpen = openModules.has(module.id);
          const panelId = `module-panel-${module.id}`;
          const moduleMinutes = module.lessons.reduce(
            (total, lesson) => total + (lesson.durationMinutes ?? 0),
            0,
          );

          return (
            <li key={module.id} className="bg-surface">
              <h3>
                <button
                  type="button"
                  onClick={() => toggle(module.id)}
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-surface-sunken"
                >
                  <span
                    className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary-soft text-sm font-semibold text-primary"
                    aria-hidden="true"
                  >
                    {moduleIndex + 1}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-text-primary">{module.title}</span>
                    <span className="block text-xs text-text-muted">
                      {module.lessons.length}{' '}
                      {module.lessons.length === 1 ? 'lesson' : 'lessons'}
                      {moduleMinutes > 0 ? ` · ${formatDuration(moduleMinutes)}` : ''}
                    </span>
                  </span>

                  <ChevronDown
                    className={cn(
                      'size-4 shrink-0 text-text-muted transition-transform duration-200',
                      isOpen && 'rotate-180',
                    )}
                    aria-hidden="true"
                  />
                </button>
              </h3>

              <div id={panelId} hidden={!isOpen}>
                {module.summary ? (
                  <p className="px-5 pb-3 text-sm text-text-secondary">{module.summary}</p>
                ) : null}

                <ul className="border-t border-border">
                  {module.lessons.map((lesson) => {
                    const Icon = LESSON_ICONS[lesson.type] ?? FileText;
                    const isAccessible = isEnrolled || lesson.isPreview;
                    const rowClasses =
                      'flex items-center gap-3.5 px-5 py-3 pl-[4.25rem] text-sm transition-colors';

                    const inner = (
                      <>
                        <Icon
                          className={cn(
                            'size-4 shrink-0',
                            isAccessible ? 'text-primary' : 'text-text-muted',
                          )}
                          aria-hidden="true"
                        />
                        <span
                          className={cn(
                            'min-w-0 flex-1 truncate',
                            isAccessible ? 'text-text-secondary' : 'text-text-muted',
                          )}
                        >
                          {lesson.title}
                        </span>
                        {lesson.isPreview && !isEnrolled ? (
                          <Badge tone="accent">Preview</Badge>
                        ) : null}
                        {lesson.durationMinutes ? (
                          <span className="shrink-0 text-xs text-text-muted">
                            {formatDuration(lesson.durationMinutes)}
                          </span>
                        ) : null}
                        {!isAccessible ? (
                          <Lock className="size-3.5 shrink-0 text-text-muted" aria-hidden="true" />
                        ) : null}
                      </>
                    );

                    return (
                      <li key={lesson.id} className="border-b border-border last:border-b-0">
                        {isAccessible ? (
                          <Link
                            href={localePath(locale, `/learn/${courseSlug}/${lesson.slug}`)}
                            className={cn(rowClasses, 'hover:bg-primary-soft')}
                          >
                            {inner}
                          </Link>
                        ) : (
                          <div className={rowClasses} aria-label={`${lesson.title} (locked)`}>
                            {inner}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
