import type { Metadata } from 'next';
import { UsersClient } from '@/components/admin/users-client';

export const metadata: Metadata = {
  title: 'Users',
  robots: { index: false, follow: false },
};

export default async function AdminUsersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return <UsersClient locale={locale} />;
}
