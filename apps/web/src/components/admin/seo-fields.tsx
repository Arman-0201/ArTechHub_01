'use client';

import { cn, truncate } from '@/lib/utils';
import { Card, Input, Select, Textarea } from '@/components/ui';
import { MediaPickerButton } from './media-picker';

export interface SeoFormValue {
  title: string;
  description: string;
  keywords: string;
  canonicalUrl: string;
  ogTitle: string;
  ogDescription: string;
  ogImageUrl: string;
  robots: string;
}

/**
 * Shared SEO form.
 *
 * The same fields back pages, courses, articles and products, so they live in
 * one component. The live search preview and the length counters exist because
 * titles and descriptions are silently truncated by search engines — showing
 * the limit while typing is far more useful than validating it afterwards.
 */
const TITLE_LIMIT = 60;
const DESCRIPTION_LIMIT = 160;

export function SeoFields({
  value,
  onChange,
  previewTitle,
  previewPath,
}: {
  value: SeoFormValue;
  onChange: (value: SeoFormValue) => void;
  previewTitle: string;
  previewPath: string;
}) {
  const set = (patch: Partial<SeoFormValue>) => onChange({ ...value, ...patch });

  const effectiveTitle = value.title || previewTitle;
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://example.com').replace(/^https?:\/\//, '');

  return (
    <div className="space-y-5">
      <Card>
        <div className="space-y-4 p-5">
          <h2 className="text-base font-semibold text-text-primary">Search appearance</h2>

          <div className="rounded-lg border border-border bg-surface-sunken p-4">
            <p className="truncate text-xs text-text-muted">
              {siteUrl}
              {previewPath}
            </p>
            <p className="mt-0.5 truncate text-base text-primary">
              {truncate(effectiveTitle, TITLE_LIMIT)}
            </p>
            <p className="mt-0.5 line-clamp-2 text-sm text-text-secondary">
              {value.description || 'Add a meta description to control this snippet.'}
            </p>
          </div>

          <div className="space-y-1.5">
            <Input
              label="Meta title"
              value={value.title}
              onChange={(event) => set({ title: event.target.value })}
              hint={`Falls back to the item title when blank.`}
            />
            <p
              className={cn(
                'text-right text-2xs',
                value.title.length > TITLE_LIMIT ? 'text-warning' : 'text-text-muted',
              )}
            >
              {value.title.length}/{TITLE_LIMIT}
            </p>
          </div>

          <div className="space-y-1.5">
            <Textarea
              label="Meta description"
              rows={3}
              value={value.description}
              onChange={(event) => set({ description: event.target.value })}
            />
            <p
              className={cn(
                'text-right text-2xs',
                value.description.length > DESCRIPTION_LIMIT ? 'text-warning' : 'text-text-muted',
              )}
            >
              {value.description.length}/{DESCRIPTION_LIMIT}
            </p>
          </div>

          <Input
            label="Keywords"
            hint="Comma separated. Minor ranking signal, but useful for internal search."
            value={value.keywords}
            onChange={(event) => set({ keywords: event.target.value })}
          />
        </div>
      </Card>

      <Card>
        <div className="space-y-4 p-5">
          <h2 className="text-base font-semibold text-text-primary">Social sharing</h2>

          <Input
            label="Open Graph title"
            hint="Falls back to the meta title."
            value={value.ogTitle}
            onChange={(event) => set({ ogTitle: event.target.value })}
          />

          <Textarea
            label="Open Graph description"
            rows={2}
            hint="Falls back to the meta description."
            value={value.ogDescription}
            onChange={(event) => set({ ogDescription: event.target.value })}
          />

          <div className="flex items-end gap-2">
            <Input
              label="Share image URL"
              hint="1200×630 works everywhere."
              value={value.ogImageUrl}
              onChange={(event) => set({ ogImageUrl: event.target.value })}
              containerClassName="flex-1"
            />
            <MediaPickerButton
              kind="IMAGE"
              onSelect={(media) => set({ ogImageUrl: media.url })}
            />
          </div>
        </div>
      </Card>

      <Card>
        <div className="space-y-4 p-5">
          <h2 className="text-base font-semibold text-text-primary">Indexing</h2>

          <Select
            label="Robots directive"
            value={value.robots}
            onChange={(event) => set({ robots: event.target.value })}
            options={[
              { value: 'index, follow', label: 'Index and follow links (default)' },
              { value: 'noindex, follow', label: 'Do not index, follow links' },
              { value: 'index, nofollow', label: 'Index, do not follow links' },
              { value: 'noindex, nofollow', label: 'Do not index or follow' },
            ]}
          />

          <Input
            label="Canonical URL"
            hint="Only set this when the content is also published elsewhere."
            placeholder="https://…"
            value={value.canonicalUrl}
            onChange={(event) => set({ canonicalUrl: event.target.value })}
          />
        </div>
      </Card>
    </div>
  );
}

/** Builds the API payload from the form's string-based state. */
export function toSeoPayload(value: SeoFormValue) {
  return {
    title: value.title || null,
    description: value.description || null,
    keywords: value.keywords
      .split(',')
      .map((keyword) => keyword.trim())
      .filter(Boolean),
    canonicalUrl: value.canonicalUrl || null,
    ogTitle: value.ogTitle || null,
    ogDescription: value.ogDescription || null,
    ogImageUrl: value.ogImageUrl || null,
    robots: value.robots || null,
  };
}

export function emptySeoForm(seo?: {
  title: string | null;
  description: string | null;
  keywords: string[];
  canonicalUrl: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImageUrl: string | null;
  robots: string | null;
} | null): SeoFormValue {
  return {
    title: seo?.title ?? '',
    description: seo?.description ?? '',
    keywords: seo?.keywords.join(', ') ?? '',
    canonicalUrl: seo?.canonicalUrl ?? '',
    ogTitle: seo?.ogTitle ?? '',
    ogDescription: seo?.ogDescription ?? '',
    ogImageUrl: seo?.ogImageUrl ?? '',
    robots: seo?.robots ?? 'index, follow',
  };
}
