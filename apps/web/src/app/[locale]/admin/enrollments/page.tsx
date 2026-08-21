import type { Metadata } from 'next';
import { EnrollmentsClient } from '@/components/admin/enrollments-client';

export const metadata: Metadata = {
  title: 'Enrollments',
  robots: { index: false, follow: false },
};

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <EnrollmentsClient locale={locale} />;
}
