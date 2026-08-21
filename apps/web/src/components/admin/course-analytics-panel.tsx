'use client';

import { Loader2 } from 'lucide-react';
import { useApiResource } from '@/lib/api/hooks';
import { formatNumber } from '@/lib/utils';
import { Alert, Card, ProgressBar } from '@/components/ui';
import { StatCard } from './primitives';

interface CourseAnalytics {
  enrollments: number;
  completions: number;
  completionRate: number;
  averageProgressPercent: number;
  lessons: { id: string; title: string; completions: number; completionRate: number }[];
}

/**
 * Per-course analytics.
 *
 * The per-lesson completion column is the point of this screen: a sharp drop
 * between two consecutive lessons is where learners are giving up, and that is
 * the single most actionable number an author can have.
 */
export function CourseAnalyticsPanel({
  courseId,
  locale,
}: {
  courseId: string;
  locale: string;
}) {
  const query = useApiResource<CourseAnalytics>(`/admin/courses/${courseId}/analytics`);

  if (query.isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="size-6 animate-spin text-text-muted" aria-hidden="true" />
        <span className="sr-only">Loading analytics</span>
      </div>
    );
  }

  if (query.error || !query.data) {
    return <Alert tone="danger">{query.error?.message ?? 'Analytics are unavailable.'}</Alert>;
  }

  const data = query.data;

  return (
    <div className="max-w-4xl space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Enrolled" value={formatNumber(data.enrollments, locale)} />
        <StatCard label="Completed" value={formatNumber(data.completions, locale)} />
        <StatCard label="Completion rate" value={`${data.completionRate}%`} />
        <StatCard label="Average progress" value={`${data.averageProgressPercent}%`} />
      </div>

      <Card>
        <div className="p-5">
          <h2 className="text-base font-semibold text-text-primary">Completion by lesson</h2>
          <p className="text-sm text-text-muted">
            Where the rate falls sharply is where learners are dropping off.
          </p>

          {data.lessons.length === 0 ? (
            <p className="mt-5 text-sm text-text-muted">This course has no lessons yet.</p>
          ) : (
            <ol className="mt-5 space-y-3">
              {data.lessons.map((lesson, index) => {
                const previous = data.lessons[index - 1];
                // A double-digit fall from the previous lesson is worth flagging.
                const isDropOff =
                  previous !== undefined && previous.completionRate - lesson.completionRate >= 15;

                return (
                  <li key={lesson.id} className="space-y-1.5">
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate text-text-secondary">
                        {index + 1}. {lesson.title}
                      </span>
                      <span className="shrink-0 tabular-nums text-text-muted">
                        {formatNumber(lesson.completions, locale)}
                        <span className="ml-2 font-semibold text-text-primary">
                          {lesson.completionRate}%
                        </span>
                      </span>
                    </div>
                    <ProgressBar
                      value={lesson.completionRate}
                      size="sm"
                      label={`${lesson.title}: ${lesson.completionRate}% completed`}
                    />
                    {isDropOff ? (
                      <p className="text-2xs text-warning">
                        Sharp drop from the previous lesson — worth reviewing.
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </Card>
    </div>
  );
}
