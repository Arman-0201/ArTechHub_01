import type { Metadata } from 'next';
import { BlogClient } from '@/components/admin/blog-client';

export const metadata: Metadata = {
  title: 'Articles',
  robots: { index: false, follow: false },
};

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <BlogClient locale={locale} />;
}
