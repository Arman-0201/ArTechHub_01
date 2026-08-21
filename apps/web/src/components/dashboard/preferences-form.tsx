'use client';

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Monitor, Moon, Sun } from 'lucide-react';
import { api } from '@/lib/api/client';
import { ApiError } from '@/lib/api/types';
import { cn } from '@/lib/utils';
import { LOCALE_COOKIE, swapLocaleInPath } from '@/lib/i18n/config';
import { useSite, useTheme } from '@/components/providers';
import type { ThemePreference } from '@/components/providers/theme-provider';
import { Alert, Button, Card, Checkbox, Select } from '@/components/ui';

const THEMES: { value: ThemePreference; label: string; Icon: typeof Sun }[] = [
  { value: 'system', label: 'Match system', Icon: Monitor },
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
];

/**
 * Account preferences.
 *
 * Language is persisted twice on purpose: to the account (so it follows the
 * user to another device) and to the locale cookie (so the very next request,
 * including the redirect below, already uses it).
 */
export function PreferencesForm({ currentLocale }: { currentLocale: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const { bootstrap } = useSite();
  const { theme, setTheme } = useTheme();

  const [selectedLocale, setSelectedLocale] = useState(currentLocale);
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setStatus('saving');
    setError(null);
    try {
      await api.patch('/account/preferences', {
        locale: selectedLocale,
        theme,
        emailNotifications,
        marketingOptIn,
      });

      setStatus('saved');

      if (selectedLocale !== currentLocale) {
        document.cookie = `${LOCALE_COOKIE}=${selectedLocale}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
        router.push(swapLocaleInPath(pathname, selectedLocale));
        router.refresh();
      }
    } catch (caught) {
      setStatus('error');
      setError(
        caught instanceof ApiError ? caught.message : 'Could not save your preferences. Try again.',
      );
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <div className="space-y-5 p-6">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-text-primary">Language</h2>
            <p className="text-sm text-text-muted">
              Applies to the interface and, where available, course content.
            </p>
          </div>

          <Select
            label="Preferred language"
            value={selectedLocale}
            onChange={(event) => setSelectedLocale(event.target.value)}
            options={bootstrap.languages.map((language) => ({
              value: language.code,
              label: `${language.nativeName} (${language.name})`,
            }))}
            containerClassName="max-w-sm"
          />
        </div>
      </Card>

      <Card>
        <div className="space-y-5 p-6">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-text-primary">Appearance</h2>
            <p className="text-sm text-text-muted">
              Applies immediately and is remembered on this device.
            </p>
          </div>

          <div
            className="grid gap-3 sm:grid-cols-3"
            role="radiogroup"
            aria-label="Theme preference"
          >
            {THEMES.map(({ value, label, Icon }) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={theme === value}
                onClick={() => setTheme(value)}
                className={cn(
                  'flex items-center gap-2.5 rounded-lg border p-4 text-sm font-medium transition-colors',
                  theme === value
                    ? 'border-primary bg-primary-soft text-primary'
                    : 'border-border text-text-secondary hover:border-border-strong',
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <Card>
        <div className="space-y-5 p-6">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-text-primary">Email</h2>
            <p className="text-sm text-text-muted">
              Account and security emails are always sent — they are not optional.
            </p>
          </div>

          <div className="space-y-3">
            <Checkbox
              label="Course and progress notifications"
              checked={emailNotifications}
              onChange={(event) => setEmailNotifications(event.target.checked)}
            />
            <Checkbox
              label="Occasional product and course updates"
              checked={marketingOptIn}
              onChange={(event) => setMarketingOptIn(event.target.checked)}
            />
          </div>
        </div>
      </Card>

      {status === 'saved' ? <Alert tone="success">Preferences saved.</Alert> : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div className="flex justify-end">
        <Button onClick={save} isLoading={status === 'saving'}>
          Save preferences
        </Button>
      </div>
    </div>
  );
}
