import type { Metadata } from 'next';
import { VerifyAccountView } from '@/components/auth/password-forms';

export const metadata: Metadata = {
  title: 'Verify your email',
  robots: { index: false, follow: false },
};

export default async function VerifyAccountPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  return <VerifyAccountView locale={locale} token={query.token} />;
}
