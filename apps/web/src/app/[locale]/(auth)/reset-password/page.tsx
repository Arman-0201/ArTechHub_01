import type { Metadata } from 'next';
import { ResetPasswordForm } from '@/components/auth/password-forms';

export const metadata: Metadata = {
  title: 'Choose a new password',
  robots: { index: false, follow: false },
};

export default async function ResetPasswordPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  return <ResetPasswordForm locale={locale} token={query.token ?? ''} />;
}
