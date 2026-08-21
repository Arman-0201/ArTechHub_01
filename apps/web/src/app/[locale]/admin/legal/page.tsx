import type { Metadata } from 'next';
import { LegalClient } from '@/components/admin/legal-client';

export const metadata: Metadata = {
  title: 'Legal documents',
  robots: { index: false, follow: false },
};

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <LegalClient locale={locale} />;
}
