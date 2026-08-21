import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getCourse, getLesson, getSessionUser } from '@/lib/api/queries';
import { ApiError } from '@/lib/api/types';
import { localePath } from '@/lib/i18n/config';
import { LearnShell } from '@/components/learn/learn-shell';

/**
 * Lesson page — the learning interface.
 *
 * Rendered on the server so the lesson body is in the initial HTML: reading
 * starts immediately, and the content is available without JavaScript.
 * Interactivity (sidebar, completion, progress) is layered on by client
 * components inside `LearnShell`.
 *
 * Access is decided by the API. A 403 here means "not enrolled", so the learner
 * is sent to the course page to enroll rather than shown an error.
 */

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; courseSlug: string; lessonSlug: string }>;
}): Promise<Metadata> {
  const { locale, courseSlug, lessonSlug } = await params;
  try {
    const lesson = await getLesson(courseSlug, lessonSlug, locale);
    return {
      title: `${lesson.title} · ${lesson.courseTitle}`,
      description: lesson.summary ?? undefined,
      // Lesson pages are gated content; keeping them out of the index avoids
      // indexing a page most visitors cannot read.
      robots: { index: false, follow: false },
    };
  } catch {
    return { title: 'Lesson', robots: { index: false, follow: false } };
  }
}

export default async function LessonPage({
  params,
}: {
  params: Promise<{ locale: string; courseSlug: string; lessonSlug: string }>;
}) {
  const { locale, courseSlug, lessonSlug } = await params;

  const user = await getSessionUser();

  let lesson;
  try {
    lesson = await getLesson(courseSlug, lessonSlug, locale);
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.isNotFound) notFound();
      if (error.isAuthError) {
        redirect(
          localePath(locale, `/login?redirect=/learn/${courseSlug}/${lessonSlug}`),
        );
      }
      if (error.isForbidden) {
        // Signed in but not enrolled — the course page is where that is fixed.
        redirect(localePath(locale, `/courses/${courseSlug}`));
      }
    }
    throw error;
  }

  // The course is fetched alongside the lesson for the sidebar curriculum and
  // the learner's overall progress.
  const course = await getCourse(courseSlug, locale);
  if (!course) notFound();

  return (
    <LearnShell
      lesson={lesson}
      course={course}
      locale={locale}
      isSignedIn={Boolean(user)}
      isEnrolled={course.viewer?.isEnrolled ?? false}
    />
  );
}
