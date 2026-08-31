import type { Metadata } from 'next';
import { MessagesClient } from '@/components/admin/messages-client';

export const metadata: Metadata = {
  title: 'Inbox',
  robots: { index: false, follow: false },
};

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <MessagesClient locale={locale} />;
}
