import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LOCALE_CODES } from '@academy/types';
import { isValidLocale, localeDirection } from '@/lib/i18n/config';
import { buildMessages } from '@/lib/i18n/translate';
import { getBootstrap, getSessionUser, getTranslations } from '@/lib/api/queries';
import { Providers, ThemeScript } from '@/components/providers';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { MaintenanceNotice } from '@/components/layout/maintenance-notice';

/**
 * Locale layout — the real root of the application.
 *
 * It resolves the locale, loads the bootstrap payload once (settings, feature
 * flags, navigation, languages), and hands everything to the client providers.
 * Every page below it renders inside this chrome.
 */

export function generateStaticParams() {
  return LOCALE_CODES.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isValidLocale(locale)) return {};

  const bootstrap = await getBootstrap(locale);
  const { settings } = bootstrap;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

  return {
    title: {
      default: settings.defaultSeo?.title ?? settings.siteName,
      template: `%s · ${settings.siteName}`,
    },
    description: settings.defaultSeo?.description ?? settings.siteDescription ?? undefined,
    keywords: settings.defaultSeo?.keywords,
    applicationName: settings.siteName,
    ...(settings.faviconUrl ? { icons: { icon: settings.faviconUrl } } : {}),
    openGraph: {
      type: 'website',
      siteName: settings.siteName,
      locale,
      url: `${siteUrl}/${locale}`,
      title: settings.defaultSeo?.ogTitle ?? settings.defaultSeo?.title ?? settings.siteName,
      description:
        settings.defaultSeo?.ogDescription ??
        settings.defaultSeo?.description ??
        settings.siteDescription ??
        undefined,
      ...(settings.defaultSeo?.ogImageUrl ? { images: [settings.defaultSeo.ogImageUrl] } : {}),
    },
    twitter: {
      card: (settings.defaultSeo?.twitterCard as 'summary_large_image') ?? 'summary_large_image',
      title: settings.defaultSeo?.title ?? settings.siteName,
      description: settings.defaultSeo?.description ?? undefined,
    },
    alternates: {
      canonical: `${siteUrl}/${locale}`,
      // Every locale is advertised, so search engines index the right variant
      // per audience instead of treating them as duplicates.
      languages: Object.fromEntries(
        bootstrap.languages.map((language) => [language.code, `${siteUrl}/${language.code}`]),
      ),
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isValidLocale(locale)) notFound();

  const [bootstrap, remoteMessages, user] = await Promise.all([
    getBootstrap(locale),
    getTranslations(locale),
    getSessionUser(),
  ]);

  const messages = buildMessages(locale, remoteMessages);
  const direction = localeDirection(locale);

  // Staff keep working during maintenance; everyone else sees the notice.
  const showMaintenance =
    bootstrap.settings.maintenanceMode && !(user?.canAccessAdmin ?? false);

  return (
    <html lang={locale} dir={direction} suppressHydrationWarning>
      <head>
        <ThemeScript />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Newsreader:opsz,wght@6..72,400;6..72,500;6..72,600&family=JetBrains+Mono:wght@400;500&display=swap"
        />
      </head>
      <body>
        <Providers
          locale={locale}
          bootstrap={bootstrap}
          messages={messages}
          initialUser={user}
        >
          {showMaintenance ? (
            <MaintenanceNotice
              siteName={bootstrap.settings.siteName}
              message={bootstrap.settings.maintenanceMessage}
            />
          ) : (
            <div className="flex min-h-dvh flex-col">
              <a href="#main-content" className="skip-link">
                {messages['nav.skipToContent'] ?? 'Skip to content'}
              </a>
              <SiteHeader />
              <main id="main-content" className="flex-1">
                {children}
              </main>
              <SiteFooter />
            </div>
          )}
        </Providers>
      </body>
    </html>
  );
}
