import Link from 'next/link';
import { GraduationCap, ShieldCheck, TrendingUp, Languages } from 'lucide-react';
import { getBootstrap } from '@/lib/api/queries';
import { localePath } from '@/lib/i18n/config';

/**
 * Split layout for the authentication screens.
 *
 * The form sits on the left where the eye lands first; the right panel carries
 * the product reassurance and collapses away entirely on small screens rather
 * than pushing the form below the fold.
 */
export default async function AuthLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const bootstrap = await getBootstrap(locale);
  const { settings } = bootstrap;

  const points = [
    {
      Icon: TrendingUp,
      title: 'Progress that follows you',
      description: 'Completion is stored against your account, not this browser.',
    },
    {
      Icon: ShieldCheck,
      title: 'Your data stays yours',
      description: 'No third-party trackers on lesson pages, ever.',
    },
    {
      Icon: Languages,
      title: 'Eight languages',
      description: 'Interface and course content, with graceful fallback.',
    },
  ];

  return (
    <div className="grid min-h-[calc(100dvh-var(--header-height))] lg:grid-cols-2">
      <div className="flex items-center justify-center px-5 py-12 sm:px-8">
        <div className="w-full max-w-md">{children}</div>
      </div>

      <aside className="relative hidden overflow-hidden bg-ink-900 lg:flex lg:items-center">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse at 30% 10%, rgba(118,146,255,0.28), transparent 55%), radial-gradient(ellipse at 80% 90%, rgba(171,210,250,0.18), transparent 50%)',
          }}
          aria-hidden="true"
        />

        <div className="relative w-full px-12 py-16">
          <Link
            href={localePath(locale, '/')}
            className="inline-flex items-center gap-3 text-white"
          >
            {settings.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={settings.logoUrl} alt={settings.siteName} className="h-9 w-auto" />
            ) : (
              <>
                <span className="grid size-10 place-items-center rounded-xl bg-white/10">
                  <GraduationCap className="size-5" aria-hidden="true" />
                </span>
                <span className="text-lg font-semibold">{settings.siteName}</span>
              </>
            )}
          </Link>

          <p className="mt-12 max-w-md text-3xl font-semibold leading-tight text-white">
            {settings.siteTagline ?? 'Practical IT skills, taught properly.'}
          </p>

          <ul className="mt-10 space-y-6">
            {points.map(({ Icon, title, description }) => (
              <li key={title} className="flex gap-4">
                <span
                  className="grid size-10 shrink-0 place-items-center rounded-lg bg-white/10 text-sky-300"
                  aria-hidden="true"
                >
                  <Icon className="size-5" />
                </span>
                <span>
                  <span className="block font-medium text-white">{title}</span>
                  <span className="block text-sm text-ink-200">{description}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
