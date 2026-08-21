import type { Metadata } from 'next';
import { CourseEditor } from '@/components/admin/course-editor';

export const metadata: Metadata = {
  title: 'Edit course',
  robots: { index: false, follow: false },
};

export default async function AdminCourseEditorPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  return <CourseEditor locale={locale} courseId={id} />;
}
