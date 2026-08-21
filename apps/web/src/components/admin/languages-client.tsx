'use client';

import { useEffect, useState } from 'react';
import { Check, Languages as LanguagesIcon, Save, Search, Star } from 'lucide-react';
import type { LanguageDto } from '@academy/types';
import { PERMISSIONS } from '@academy/types';
import { api, useApiList, useApiMutation, useApiResource } from '@/lib/api/hooks';
import { cn } from '@/lib/utils';
import { useAuth } from '@/components/providers';
import { Alert, Badge, Button, Card, Input, ProgressBar, Select } from '@/components/ui';
import { AdminPageHeader } from './primitives';

interface TranslationRow {
  namespace: string;
  key: string;
  value: string;
  updatedAt: string;
}

/**
 * Languages and UI translations.
 *
 * The set of *available* locales is code-defined; which are active, and what
 * each string says, is data. So adding Spanish is a toggle here, and correcting
 * a mistranslation is an inline edit — neither needs a deployment.
 */
export function LanguagesClient() {
  const { can } = useAuth();
  const canManageLanguages = can(PERMISSIONS.LANGUAGES_MANAGE);
  const canManageTranslations = can(PERMISSIONS.TRANSLATIONS_MANAGE);

  const [selectedLocale, setSelectedLocale] = useState('en');
  const [error, setError] = useState<string | null>(null);

  const languagesQuery = useApiList<LanguageDto>('/admin/languages');
  const languages = languagesQuery.data?.items ?? [];

  const updateMutation = useApiMutation(
    ({ code, patch }: { code: string; patch: Record<string, boolean> }) =>
      api.patch(`/admin/languages/${code}`, patch),
    ['/admin/languages', '/site/bootstrap'],
    { onError: (caught) => setError(caught.message) },
  );

  return (
    <>
      <AdminPageHeader
        title="Languages"
        description="Which languages the platform offers, and what the interface says in each."
      />

      {error ? (
        <Alert tone="danger" className="mb-4">
          {error}
        </Alert>
      ) : null}

      <div className="space-y-8">
        <section>
          <h2 className="mb-3 text-base font-semibold text-text-primary">Available languages</h2>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {languages.map((language) => (
              <Card key={language.code}>
                <div className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      {language.flag ? (
                        <span className="text-xl leading-none" aria-hidden="true">
                          {language.flag}
                        </span>
                      ) : null}
                      <div className="min-w-0">
                        <p className="truncate font-medium text-text-primary">
                          {language.nativeName}
                        </p>
                        <p className="truncate text-2xs text-text-muted">
                          {language.name} · {language.code}
                        </p>
                      </div>
                    </div>

                    {language.isDefault ? (
                      <Badge tone="primary">
                        <Star className="size-3" aria-hidden="true" />
                        Default
                      </Badge>
                    ) : null}
                  </div>

                  {language.completeness !== undefined ? (
                    <div className="space-y-1">
                      <div className="flex justify-between text-2xs text-text-muted">
                        <span>Interface translated</span>
                        <span>{language.completeness}%</span>
                      </div>
                      <ProgressBar value={language.completeness} size="sm" />
                    </div>
                  ) : null}

                  {canManageLanguages ? (
                    <div className="flex gap-2 border-t border-border pt-3">
                      <Button
                        size="sm"
                        variant={language.isActive ? 'secondary' : 'outline'}
                        onClick={() => {
                          setError(null);
                          updateMutation.mutate({
                            code: language.code,
                            patch: { isActive: !language.isActive },
                          });
                        }}
                        disabled={language.isDefault}
                        title={
                          language.isDefault
                            ? 'The default language cannot be deactivated.'
                            : undefined
                        }
                      >
                        {language.isActive ? 'Active' : 'Activate'}
                      </Button>

                      {!language.isDefault && language.isActive ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setError(null);
                            updateMutation.mutate({
                              code: language.code,
                              patch: { isDefault: true },
                            });
                          }}
                        >
                          Make default
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </Card>
            ))}
          </div>
        </section>

        {canManageTranslations ? (
          <section>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-text-primary">Interface strings</h2>
                <p className="text-sm text-text-muted">
                  Values saved here override the built-in defaults.
                </p>
              </div>

              <Select
                aria-label="Language to edit"
                value={selectedLocale}
                onChange={(event) => setSelectedLocale(event.target.value)}
                options={languages.map((language) => ({
                  value: language.code,
                  label: `${language.nativeName} (${language.code})`,
                }))}
                containerClassName="w-56"
              />
            </div>

            <TranslationEditor locale={selectedLocale} />
          </section>
        ) : null}
      </div>
    </>
  );
}

function TranslationEditor({ locale }: { locale: string }) {
  const query = useApiResource<TranslationRow[]>(`/admin/translations/${locale}`);
  const [search, setSearch] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Switching language discards unsaved edits for the previous one, which is
  // the expected behaviour — the alternative is silently carrying them over.
  useEffect(() => {
    setDrafts({});
    setSaved(false);
  }, [locale]);

  const mutation = useApiMutation(
    (namespace: string) =>
      api.put('/admin/translations', {
        locale,
        namespace,
        entries: Object.fromEntries(
          Object.entries(drafts)
            .filter(([key]) => key.startsWith(`${namespace}.`))
            .map(([key, value]) => [key.slice(namespace.length + 1), value]),
        ),
      }),
    ['/admin/translations', '/site/translations'],
    {
      onSuccess: () => {
        setDrafts({});
        setSaved(true);
      },
      onError: (caught) => setError(caught.message),
    },
  );

  const rows = query.data ?? [];
  const filtered = search
    ? rows.filter(
        (row) =>
          `${row.namespace}.${row.key}`.toLowerCase().includes(search.toLowerCase()) ||
          row.value.toLowerCase().includes(search.toLowerCase()),
      )
    : rows;

  const namespaces = [...new Set(filtered.map((row) => row.namespace))];
  const hasChanges = Object.keys(drafts).length > 0;

  return (
    <div className="space-y-4">
      {saved ? <Alert tone="success">Translations saved.</Alert> : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Input
        type="search"
        placeholder="Search keys or values…"
        aria-label="Search translations"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        leadingIcon={<Search className="size-4" />}
      />

      {query.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="skeleton h-12 rounded-lg" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <div className="p-10 text-center">
            <LanguagesIcon className="mx-auto size-8 text-text-muted" aria-hidden="true" />
            <p className="mt-3 text-text-secondary">
              No stored strings for this language yet. The built-in dictionary is used until you add
              some.
            </p>
          </div>
        </Card>
      ) : (
        namespaces.map((namespace) => {
          const namespaceRows = filtered.filter((row) => row.namespace === namespace);
          const namespaceChanged = Object.keys(drafts).some((key) =>
            key.startsWith(`${namespace}.`),
          );

          return (
            <Card key={namespace}>
              <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                <span className="font-mono text-xs font-semibold text-text-primary">
                  {namespace}
                </span>
                {namespaceChanged ? (
                  <Button
                    size="sm"
                    onClick={() => {
                      setError(null);
                      mutation.mutate(namespace);
                    }}
                    isLoading={mutation.isPending}
                  >
                    <Save className="size-3.5" aria-hidden="true" />
                    Save
                  </Button>
                ) : null}
              </div>

              <ul className="divide-y divide-border">
                {namespaceRows.map((row) => {
                  const fullKey = `${row.namespace}.${row.key}`;
                  const draft = drafts[fullKey];

                  return (
                    <li key={fullKey} className="grid gap-2 p-3 sm:grid-cols-[minmax(0,14rem)_1fr]">
                      <label
                        htmlFor={`translation-${fullKey}`}
                        className="truncate font-mono text-2xs text-text-muted sm:pt-2.5"
                      >
                        {row.key}
                      </label>
                      <input
                        id={`translation-${fullKey}`}
                        type="text"
                        value={draft ?? row.value}
                        onChange={(event) => {
                          setSaved(false);
                          setDrafts({ ...drafts, [fullKey]: event.target.value });
                        }}
                        className={cn(
                          'w-full rounded-lg border bg-surface px-3 py-2 text-sm text-text-primary',
                          'focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20',
                          draft !== undefined ? 'border-primary' : 'border-border',
                        )}
                      />
                    </li>
                  );
                })}
              </ul>
            </Card>
          );
        })
      )}

      {hasChanges ? (
        <p className="flex items-center gap-1.5 text-xs text-text-muted">
          <Check className="size-3.5" aria-hidden="true" />
          Unsaved changes are highlighted. Save each namespace separately.
        </p>
      ) : null}
    </div>
  );
}
