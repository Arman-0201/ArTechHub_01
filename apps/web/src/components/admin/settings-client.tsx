'use client';

import { useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import type { SiteSettingsDto } from '@academy/types';
import { PERMISSIONS } from '@academy/types';
import { api, useApiMutation, useApiResource } from '@/lib/api/hooks';
import { useAuth, useSite } from '@/components/providers';
import { Alert, Button, Card, Checkbox, Input, Select, Textarea } from '@/components/ui';
import { AdminPageHeader } from './primitives';
import { MediaPickerField } from './media-picker';
import { SeoFields, emptySeoForm, toSeoPayload, type SeoFormValue } from './seo-fields';

interface AdminSettingsResponse {
  resolved: SiteSettingsDto;
}

/**
 * Platform settings.
 *
 * Everything the site chrome reads — name, logo, contact details, social links,
 * default language, maintenance mode — lives here rather than in code, which is
 * what makes rebranding or a maintenance window a configuration change.
 */
export function SettingsClient() {
  const { can } = useAuth();
  const { bootstrap } = useSite();
  const canManage = can(PERMISSIONS.SETTINGS_MANAGE);

  const settingsQuery = useApiResource<AdminSettingsResponse>('/admin/settings');
  const current = settingsQuery.data?.resolved;

  if (settingsQuery.isLoading || !current) {
    return (
      <>
        <AdminPageHeader title="Settings" />
        {settingsQuery.error ? (
          <Alert tone="danger">{settingsQuery.error.message}</Alert>
        ) : (
          <div className="flex justify-center py-16">
            <Loader2 className="size-6 animate-spin text-text-muted" aria-hidden="true" />
            <span className="sr-only">Loading settings</span>
          </div>
        )}
      </>
    );
  }

  return (
    <SettingsForm
      settings={current}
      canManage={canManage}
      availableLocales={bootstrap.languages.map((language) => ({
        value: language.code,
        label: `${language.nativeName} (${language.name})`,
      }))}
    />
  );
}

function SettingsForm({
  settings,
  canManage,
  availableLocales,
}: {
  settings: SiteSettingsDto;
  canManage: boolean;
  availableLocales: { value: string; label: string }[];
}) {
  const [form, setForm] = useState({
    siteName: settings.siteName,
    siteTagline: settings.siteTagline ?? '',
    siteDescription: settings.siteDescription ?? '',
    contactEmail: settings.contactEmail ?? '',
    contactPhone: settings.contactPhone ?? '',
    contactAddress: settings.contactAddress ?? '',
    defaultLocale: settings.defaultLocale,
    maintenanceMode: settings.maintenanceMode,
    maintenanceMessage: settings.maintenanceMessage ?? '',
    footerNote: settings.footerNote ?? '',
    logoMediaId: null as string | null,
    logoDarkMediaId: null as string | null,
    faviconMediaId: null as string | null,
  });

  const [socialLinks, setSocialLinks] = useState(settings.socialLinks);
  const [seo, setSeo] = useState<SeoFormValue>(() => emptySeoForm(settings.defaultSeo));
  const [status, setStatus] = useState<'idle' | 'saved'>('idle');
  const [error, setError] = useState<string | null>(null);

  const mutation = useApiMutation(
    () =>
      api.put('/admin/settings', {
        siteName: form.siteName,
        siteTagline: form.siteTagline || null,
        siteDescription: form.siteDescription || null,
        contactEmail: form.contactEmail || null,
        contactPhone: form.contactPhone || null,
        contactAddress: form.contactAddress || null,
        socialLinks: socialLinks.filter((link) => link.platform && link.url),
        defaultLocale: form.defaultLocale,
        maintenanceMode: form.maintenanceMode,
        maintenanceMessage: form.maintenanceMessage || null,
        footerNote: form.footerNote || null,
        defaultSeo: toSeoPayload(seo),
        ...(form.logoMediaId !== null ? { logoMediaId: form.logoMediaId } : {}),
        ...(form.logoDarkMediaId !== null ? { logoDarkMediaId: form.logoDarkMediaId } : {}),
        ...(form.faviconMediaId !== null ? { faviconMediaId: form.faviconMediaId } : {}),
      }),
    ['/admin/settings', '/site/bootstrap'],
    { onSuccess: () => setStatus('saved'), onError: (caught) => setError(caught.message) },
  );

  return (
    <>
      <AdminPageHeader
        title="Settings"
        description="Identity, contact details and platform-wide behaviour."
      />

      <div className="max-w-3xl space-y-6">
        {status === 'saved' ? <Alert tone="success">Settings saved.</Alert> : null}
        {error ? <Alert tone="danger">{error}</Alert> : null}

        <Card>
          <div className="space-y-5 p-5">
            <h2 className="text-base font-semibold text-text-primary">Identity</h2>

            <Input
              label="Site name"
              required
              value={form.siteName}
              onChange={(event) => setForm({ ...form, siteName: event.target.value })}
            />
            <Input
              label="Tagline"
              hint="One line, shown in the footer and on the sign-in screens."
              value={form.siteTagline}
              onChange={(event) => setForm({ ...form, siteTagline: event.target.value })}
            />
            <Textarea
              label="Description"
              rows={2}
              hint="Used as the default meta description."
              value={form.siteDescription}
              onChange={(event) => setForm({ ...form, siteDescription: event.target.value })}
            />

            <div className="grid gap-5 sm:grid-cols-3">
              <MediaPickerField
                label="Logo"
                kind="IMAGE"
                currentUrl={settings.logoUrl}
                onSelect={(media) => setForm({ ...form, logoMediaId: media?.id ?? null })}
              />
              <MediaPickerField
                label="Logo (dark theme)"
                kind="IMAGE"
                currentUrl={settings.logoDarkUrl}
                onSelect={(media) => setForm({ ...form, logoDarkMediaId: media?.id ?? null })}
              />
              <MediaPickerField
                label="Favicon"
                kind="IMAGE"
                currentUrl={settings.faviconUrl}
                onSelect={(media) => setForm({ ...form, faviconMediaId: media?.id ?? null })}
              />
            </div>
          </div>
        </Card>

        <Card>
          <div className="space-y-5 p-5">
            <h2 className="text-base font-semibold text-text-primary">Contact</h2>

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Email"
                type="email"
                value={form.contactEmail}
                onChange={(event) => setForm({ ...form, contactEmail: event.target.value })}
              />
              <Input
                label="Phone"
                value={form.contactPhone}
                onChange={(event) => setForm({ ...form, contactPhone: event.target.value })}
              />
            </div>

            <Input
              label="Address"
              value={form.contactAddress}
              onChange={(event) => setForm({ ...form, contactAddress: event.target.value })}
            />

            <fieldset className="space-y-3">
              <legend className="text-sm font-medium text-text-primary">Social links</legend>

              {socialLinks.map((link, index) => (
                <div key={index} className="flex items-end gap-2">
                  <Input
                    aria-label={`Social platform ${index + 1}`}
                    placeholder="github"
                    value={link.platform}
                    onChange={(event) =>
                      setSocialLinks(
                        socialLinks.map((entry, i) =>
                          i === index ? { ...entry, platform: event.target.value } : entry,
                        ),
                      )
                    }
                    containerClassName="w-40"
                  />
                  <Input
                    aria-label={`Social URL ${index + 1}`}
                    placeholder="https://github.com/…"
                    value={link.url}
                    onChange={(event) =>
                      setSocialLinks(
                        socialLinks.map((entry, i) =>
                          i === index ? { ...entry, url: event.target.value } : entry,
                        ),
                      )
                    }
                    containerClassName="flex-1"
                  />
                  <Button
                    variant="ghost"
                    onClick={() => setSocialLinks(socialLinks.filter((_, i) => i !== index))}
                    aria-label={`Remove social link ${index + 1}`}
                  >
                    <Trash2 className="size-4 text-danger" aria-hidden="true" />
                  </Button>
                </div>
              ))}

              <Button
                size="sm"
                variant="outline"
                onClick={() => setSocialLinks([...socialLinks, { platform: '', url: '' }])}
              >
                <Plus className="size-3.5" aria-hidden="true" />
                Add link
              </Button>
            </fieldset>
          </div>
        </Card>

        <Card>
          <div className="space-y-5 p-5">
            <h2 className="text-base font-semibold text-text-primary">Platform</h2>

            <Select
              label="Default language"
              hint="Used when a visitor has no preference we recognise."
              value={form.defaultLocale}
              onChange={(event) => setForm({ ...form, defaultLocale: event.target.value })}
              options={availableLocales}
            />

            <Input
              label="Footer note"
              hint="Replaces the automatic copyright line."
              value={form.footerNote}
              onChange={(event) => setForm({ ...form, footerNote: event.target.value })}
            />

            <div className="space-y-3 rounded-lg border border-warning/25 bg-warning-soft p-4">
              <Checkbox
                label="Maintenance mode — the public site shows a holding page"
                checked={form.maintenanceMode}
                onChange={(event) => setForm({ ...form, maintenanceMode: event.target.checked })}
              />
              <p className="text-xs text-text-secondary">
                Administrators keep full access while maintenance mode is on, so you can always turn
                it back off.
              </p>
              {form.maintenanceMode ? (
                <Textarea
                  label="Message shown to visitors"
                  rows={2}
                  value={form.maintenanceMessage}
                  onChange={(event) =>
                    setForm({ ...form, maintenanceMessage: event.target.value })
                  }
                />
              ) : null}
            </div>
          </div>
        </Card>

        <div>
          <h2 className="mb-3 text-base font-semibold text-text-primary">Default SEO</h2>
          <SeoFields value={seo} onChange={setSeo} previewTitle={form.siteName} previewPath="/" />
        </div>

        {canManage ? (
          <div className="sticky bottom-0 -mx-4 flex justify-end border-t border-border bg-background/90 px-4 py-3 backdrop-blur-sm sm:-mx-6 sm:px-6">
            <Button
              onClick={() => {
                setStatus('idle');
                setError(null);
                mutation.mutate(undefined as never);
              }}
              isLoading={mutation.isPending}
            >
              Save settings
            </Button>
          </div>
        ) : (
          <Alert tone="info">Your role can view these settings but not change them.</Alert>
        )}
      </div>
    </>
  );
}
