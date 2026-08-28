import type { Metadata } from 'next';
import { CollectionEntriesClient } from '@/components/admin/collection-entries-client';

export const metadata: Metadata = {
  title: 'Collection entries',
  robots: { index: false, follow: false },
};

export default async function AdminCollectionEntriesPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  return <CollectionEntriesClient locale={locale} collectionId={id} />;
}
