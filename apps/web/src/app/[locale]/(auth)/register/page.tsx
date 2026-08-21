import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getBootstrap } from '@/lib/api/queries';
import { RegisterForm } from '@/components/auth/register-form';

export const metadata: Metadata = {
  title: 'Create account',
  description: 'Create a free account to start learning.',
  robots: { index: false, follow: false },
};

export default async function RegisterPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ redirect?: string }>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);

  // Registration can be switched off from the admin panel. The API refuses the
  // request either way; this stops the form from being reachable at all.
  const bootstrap = await getBootstrap(locale);
  if (!bootstrap.features.REGISTRATION_ENABLED) notFound();

  return <RegisterForm locale={locale} redirectTo={query.redirect} />;
}
