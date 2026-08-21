import type { Metadata } from 'next';
import { AuditLogsClient } from '@/components/admin/audit-logs-client';

export const metadata: Metadata = {
  title: 'Audit log',
  robots: { index: false, follow: false },
};

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <AuditLogsClient locale={locale} />;
}
