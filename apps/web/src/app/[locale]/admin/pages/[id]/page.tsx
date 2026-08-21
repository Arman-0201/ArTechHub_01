import type { Metadata } from 'next';
import { PageBuilder } from '@/components/admin/page-builder';

export const metadata: Metadata = {
  title: 'Edit page',
  robots: { index: false, follow: false },
};

export default async function AdminPageBuilderPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  return <PageBuilder locale={locale} pageId={id} />;
}
