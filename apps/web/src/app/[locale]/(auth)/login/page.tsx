import type { Metadata } from 'next';
import { LoginForm } from '@/components/auth/login-form';

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to continue learning.',
  // Auth screens carry no content worth indexing and should not appear in
  // search results.
  robots: { index: false, follow: false },
};

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ redirect?: string; error?: string }>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);

  return <LoginForm locale={locale} redirectTo={query.redirect} oauthError={query.error} />;
}
