import type { Metadata } from 'next';
import { OAuthCallbackHandler } from '@/components/auth/oauth-callback';

export const metadata: Metadata = {
  title: 'Signing you in',
  robots: { index: false, follow: false },
};

/**
 * OAuth landing page.
 *
 * The API has already set the refresh cookie and redirected here. This page
 * exchanges that cookie for an access token and forwards the user on — the
 * access token is never placed in the URL, where it would leak into browser
 * history, server logs and referrer headers.
 */
export default async function OAuthCallbackPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ redirect?: string }>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);

  return <OAuthCallbackHandler locale={locale} redirectTo={query.redirect} />;
}
