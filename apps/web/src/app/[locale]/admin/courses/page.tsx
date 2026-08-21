import type { Metadata } from 'next';
import { CoursesClient } from '@/components/admin/courses-client';

export const metadata: Metadata = {
  title: 'Courses',
  robots: { index: false, follow: false },
};

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <CoursesClient locale={locale} />;
}
