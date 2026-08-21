'use client';

import { useState } from 'react';
import Link from 'next/link';
import { GraduationCap, Github, Linkedin, Mail, Twitter, Youtube } from 'lucide-react';
import { api } from '@/lib/api/client';
import { useSite } from '@/components/providers';
import { Button, Input } from '@/components/ui';

const SOCIAL_ICONS: Record<string, typeof Github> = {
  github: Github,
  linkedin: Linkedin,
  twitter: Twitter,
  x: Twitter,
  youtube: Youtube,
};

/**
 * Footer.
 *
 * Groups, links, social profiles and the copyright line all come from the
 * bootstrap payload, so the footer is editable from the admin panel without
 * touching this component.
 */
export function SiteFooter() {
  const { bootstrap, t, href, isFeatureEnabled } = useSite();
  const { settings, footer, legalLinks } = bootstrap;

  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'submitting' | 'done' | 'error'>('idle');

  async function subscribe(event: React.FormEvent) {
    event.preventDefault();
    setState('submitting');
    try {
      await api.post('/newsletter/subscribe', { email });
      setState('done');
      setEmail('');
    } catch {
      setState('error');
    }
  }

  return (
    <footer className="mt-20 border-t border-border bg-background-subtle">
      <div className="container-page py-12 lg:py-16">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]">
          <div className="space-y-4">
            <Link href={href('/')} className="inline-flex items-center gap-2.5 font-semibold">
              {settings.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={settings.logoUrl} alt={settings.siteName} className="h-8 w-auto" />
              ) : (
                <>
                  <span className="grid size-9 place-items-center rounded-lg bg-primary text-text-on-primary">
                    <GraduationCap className="size-5" aria-hidden="true" />
                  </span>
                  <span className="text-text-primary">{settings.siteName}</span>
                </>
              )}
            </Link>

            {settings.siteTagline ? (
              <p className="max-w-sm text-sm leading-relaxed text-text-secondary">
                {settings.siteTagline}
              </p>
            ) : null}

            {settings.contactEmail ? (
              <a
                href={`mailto:${settings.contactEmail}`}
                className="inline-flex items-center gap-2 text-sm text-text-secondary transition-colors hover:text-primary"
              >
                <Mail className="size-4" aria-hidden="true" />
                {settings.contactEmail}
              </a>
            ) : null}

            {footer.socialLinks.length > 0 ? (
              <ul className="flex items-center gap-2 pt-1">
                {footer.socialLinks.map((social) => {
                  const Icon = SOCIAL_ICONS[social.platform.toLowerCase()];
                  return (
                    <li key={social.platform}>
                      <a
                        href={social.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="grid size-9 place-items-center rounded-lg border border-border text-text-secondary transition-colors hover:border-primary hover:text-primary"
                        aria-label={social.platform}
                      >
                        {Icon ? (
                          <Icon className="size-4" aria-hidden="true" />
                        ) : (
                          <span className="text-xs uppercase">{social.platform.slice(0, 2)}</span>
                        )}
                      </a>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>

          {footer.groups.map((group) => (
            <nav key={group.id} aria-label={group.title}>
              <h2 className="text-sm font-semibold text-text-primary">{group.title}</h2>
              <ul className="mt-3 space-y-2.5">
                {group.links.map((link) => (
                  <li key={link.id}>
                    <Link
                      href={link.url.startsWith('http') ? link.url : href(link.url)}
                      target={link.target}
                      {...(link.target === '_blank' ? { rel: 'noopener noreferrer' } : {})}
                      className="text-sm text-text-secondary transition-colors hover:text-primary"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        {isFeatureEnabled('NEWSLETTER_ENABLED') ? (
          <div className="mt-12 rounded-2xl border border-border bg-surface p-6 sm:p-8">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-md">
                <p className="text-base font-semibold text-text-primary">{t('footer.newsletter')}</p>
                <p className="mt-1 text-sm text-text-secondary">{t('footer.newsletterHint')}</p>
              </div>

              {state === 'done' ? (
                <p className="text-sm font-medium text-success" role="status">
                  Thanks — check your inbox to confirm.
                </p>
              ) : (
                <form onSubmit={subscribe} className="flex w-full max-w-md items-start gap-2">
                  <Input
                    type="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@example.com"
                    aria-label="Email address"
                    containerClassName="flex-1"
                    error={state === 'error' ? 'Could not subscribe. Please try again.' : undefined}
                  />
                  <Button type="submit" isLoading={state === 'submitting'}>
                    {t('footer.subscribe')}
                  </Button>
                </form>
              )}
            </div>
          </div>
        ) : null}

        <div className="mt-10 flex flex-col gap-4 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-text-muted">{footer.copyright}</p>
          {legalLinks.length > 0 ? (
            <ul className="flex flex-wrap items-center gap-x-5 gap-y-2">
              {legalLinks.map((legal) => (
                <li key={legal.slug}>
                  <Link
                    href={href(`/legal/${legal.slug}`)}
                    className="text-sm text-text-muted transition-colors hover:text-primary"
                  >
                    {legal.title}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </footer>
  );
}
