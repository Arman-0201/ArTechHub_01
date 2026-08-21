import type { Metadata } from 'next';
import { ForgotPasswordForm } from '@/components/auth/password-forms';

export const metadata: Metadata = {
  title: 'Reset password',
  robots: { index: false, follow: false },
};

export default async function ForgotPasswordPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return <ForgotPasswordForm locale={locale} />;
}
