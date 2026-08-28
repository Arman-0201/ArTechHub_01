'use client';

import { useState } from 'react';
import { Copy, Eye, EyeOff, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import type { PageDto, PageSectionDto, SectionType } from '@academy/types';
import { SECTION_TYPES } from '@academy/types';
import { api, useApiMutation, useApiResource } from '@/lib/api/hooks';
import { localePath } from '@/lib/i18n/config';
import { cn } from '@/lib/utils';
import { readPdfGalleryItems } from '@/lib/pdf-gallery';
import { Alert, Badge, Button, Card, Checkbox, Input, Select } from '@/components/ui';
import { AdminPageHeader, ConfirmDialog, Modal } from './primitives';
import { SortableList } from './sortable-list';
import { SectionEditor } from './section-editor';
import { SeoFields, emptySeoForm, toSeoPayload, type SeoFormValue } from './seo-fields';

type Tab = 'sections' | 'settings' | 'seo';

/**
 * Page builder.
 *
 * The controlled kind: sections are chosen from a fixed registry of types, each
 * with its own form. There is no free-form HTML editor and no template
 * language, so an editor account cannot inject markup into the site.
 *
 * Ordering is drag-and-drop (keyboard accessible) and saved on drop.
 */
export function PageBuilder({ locale, pageId }: { locale: string; pageId: string }) {
  const [tab, setTab] = useState<Tab>('sections');

  const pageQuery = useApiResource<PageDto>(`/admin/pages/${pageId}`);
  const page = pageQuery.data;

  if (pageQuery.isLoading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="size-6 animate-spin text-text-muted" aria-hidden="true" />
        <span className="sr-only">Loading page</span>
      </div>
    );
  }

  if (pageQuery.error || !page) {
    return (
      <>
        <AdminPageHeader
          title="Page"
          breadcrumb={{ label: 'Pages', href: localePath(locale, '/admin/pages') }}
        />
        <Alert tone="danger">{pageQuery.error?.message ?? 'Page not found.'}</Alert>
      </>
    );
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'sections', label: `Sections (${page.sections.length})` },
    { id: 'settings', label: 'Settings' },
    { id: 'seo', label: 'SEO' },
  ];

  return (
    <>
      <AdminPageHeader
        title={page.title}
        description={`/${page.slug}`}
        breadcrumb={{ label: 'Pages', href: localePath(locale, '/admin/pages') }}
        action={
          <div className="flex items-center gap-2">
            <Badge tone={page.status === 'PUBLISHED' ? 'success' : 'warning'}>
              {page.status.toLowerCase()}
            </Badge>
            <Button
              variant="outline"
              size="sm"
              href={localePath(locale, page.slug === 'home' ? '/' : `/${page.slug}`)}
            >
              <Eye className="size-3.5" aria-hidden="true" />
              View
            </Button>
            <PublishToggle page={page} />
          </div>
        }
      />

      <div className="mb-6 border-b border-border">
        <nav aria-label="Page sections">
          <ul className="-mb-px flex gap-1 overflow-x-auto">
            {tabs.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  onClick={() => setTab(entry.id)}
                  aria-current={tab === entry.id ? 'page' : undefined}
                  className={cn(
                    'whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
                    tab === entry.id
                      ? 'border-primary text-primary'
                      : 'border-transparent text-text-secondary hover:border-border-strong hover:text-text-primary',
                  )}
                >
                  {entry.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      {tab === 'sections' ? <SectionsTab page={page} /> : null}
      {tab === 'settings' ? <SettingsTab page={page} locale={locale} /> : null}
      {tab === 'seo' ? <SeoTab page={page} /> : null}
    </>
  );
}

function PublishToggle({ page }: { page: PageDto }) {
  const mutation = useApiMutation(
    (status: string) => api.patch(`/admin/pages/${page.id}`, { status }),
    ['/admin/pages'],
  );

  const isPublished = page.status === 'PUBLISHED';

  return (
    <Button
      size="sm"
      variant={isPublished ? 'secondary' : 'primary'}
      onClick={() => mutation.mutate(isPublished ? 'DRAFT' : 'PUBLISHED')}
      isLoading={mutation.isPending}
    >
      {isPublished ? 'Unpublish' : 'Publish'}
    </Button>
  );
}

/* --------------------------------------------------------------- sections */

const SECTION_LABELS: Record<string, string> = {
  HERO: 'Hero',
  TEXT: 'Text',
  RICH_TEXT: 'Rich text',
  IMAGE: 'Image',
  IMAGE_TEXT: 'Image + text',
  FEATURE_GRID: 'Feature grid',
  COURSE_GRID: 'Course grid',
  CATEGORY_GRID: 'Category grid',
  STATS: 'Statistics',
  TESTIMONIALS: 'Testimonials',
  FAQ: 'FAQ',
  CTA: 'Call to action',
  CAROUSEL: 'Carousel',
  LOGO_CAROUSEL: 'Logo strip',
  VIDEO: 'Video',
  PDF_GALLERY: 'PDF gallery',
  NEWSLETTER: 'Newsletter',
  TEAM: 'Team',
  INSTRUCTOR_LIST: 'Instructors',
  BLOG_GRID: 'Article grid',
  COLLECTION_GRID: 'Reference grid',
  HTML: 'Custom HTML',
};

/**
 * The second line of a section row.
 *
 * A heading identifies most sections. A gallery often has none — the grid is
 * the content — so it says how much it holds instead, which is the thing an
 * editor scanning the list actually wants to know.
 */
function sectionSummary(section: PageSectionDto): string {
  const title = typeof section.content.title === 'string' ? section.content.title.trim() : '';
  if (title) return title;

  if (section.type === 'PDF_GALLERY') {
    const count = readPdfGalleryItems(section.content).length;
    return count === 0 ? 'No documents yet' : `${count} document${count === 1 ? '' : 's'}`;
  }

  return 'No heading';
}

function SectionsTab({ page }: { page: PageDto }) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<PageSectionDto | null>(null);
  const [deleting, setDeleting] = useState<PageSectionDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  const invalidate = [`/admin/pages/${page.id}`, '/admin/pages'];

  const reorderMutation = useApiMutation(
    (sectionIds: string[]) =>
      api.put(`/admin/pages/${page.id}/sections/reorder`, { sectionIds }),
    invalidate,
    { onError: (caught) => setError(caught.message) },
  );

  const toggleVisibilityMutation = useApiMutation(
    (section: PageSectionDto) =>
      api.patch(`/admin/sections/${section.id}`, { isVisible: !section.isVisible }),
    invalidate,
    { onError: (caught) => setError(caught.message) },
  );

  const duplicateMutation = useApiMutation(
    (section: PageSectionDto) => api.post(`/admin/sections/${section.id}/duplicate`),
    invalidate,
    { onError: (caught) => setError(caught.message) },
  );

  const deleteMutation = useApiMutation(
    (section: PageSectionDto) => api.delete(`/admin/sections/${section.id}`),
    invalidate,
    { onSuccess: () => setDeleting(null), onError: (caught) => setError(caught.message) },
  );

  return (
    <div className="max-w-4xl space-y-5">
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-text-muted">
          Drag to reorder, or focus a handle and use Alt with the arrow keys.
        </p>
        <Button size="sm" onClick={() => setAdding(true)}>
          <Plus className="size-4" aria-hidden="true" />
          Add section
        </Button>
      </div>

      {page.sections.length === 0 ? (
        <Card>
          <div className="p-10 text-center">
            <p className="text-text-secondary">This page has no sections yet.</p>
            <Button className="mt-4" onClick={() => setAdding(true)}>
              <Plus className="size-4" aria-hidden="true" />
              Add the first section
            </Button>
          </div>
        </Card>
      ) : (
        <SortableList
          items={page.sections}
          itemLabel={(section) => SECTION_LABELS[section.type] ?? section.type}
          onReorder={(orderedIds) => reorderMutation.mutate(orderedIds)}
          renderItem={(section, index) => (
            <div className="flex items-center gap-3 pr-2">
              <span
                className="grid size-7 shrink-0 place-items-center rounded-md bg-surface-sunken text-2xs font-semibold text-text-muted"
                aria-hidden="true"
              >
                {index + 1}
              </span>

              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    'truncate text-sm font-medium',
                    section.isVisible ? 'text-text-primary' : 'text-text-muted line-through',
                  )}
                >
                  {SECTION_LABELS[section.type] ?? section.type}
                </p>
                <p className="truncate text-2xs text-text-muted">{sectionSummary(section)}</p>
              </div>

              <div className="flex shrink-0 gap-0.5">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => toggleVisibilityMutation.mutate(section)}
                  aria-label={section.isVisible ? 'Hide section' : 'Show section'}
                  title={section.isVisible ? 'Hide from the page' : 'Show on the page'}
                >
                  {section.isVisible ? (
                    <Eye className="size-3.5" aria-hidden="true" />
                  ) : (
                    <EyeOff className="size-3.5" aria-hidden="true" />
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditing(section)}
                  aria-label="Edit section"
                >
                  <Pencil className="size-3.5" aria-hidden="true" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => duplicateMutation.mutate(section)}
                  aria-label="Duplicate section"
                >
                  <Copy className="size-3.5" aria-hidden="true" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setDeleting(section)}
                  aria-label="Delete section"
                >
                  <Trash2 className="size-3.5 text-danger" aria-hidden="true" />
                </Button>
              </div>
            </div>
          )}
        />
      )}

      {adding ? <AddSectionModal pageId={page.id} onClose={() => setAdding(false)} /> : null}

      {editing ? (
        <SectionEditor
          pageId={page.id}
          section={editing}
          onClose={() => setEditing(null)}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && deleteMutation.mutate(deleting)}
        title="Delete section"
        message="This section and its content are removed from the page. This cannot be undone."
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}

function AddSectionModal({ pageId, onClose }: { pageId: string; onClose: () => void }) {
  const [type, setType] = useState<SectionType>('TEXT');
  const [error, setError] = useState<string | null>(null);

  const mutation = useApiMutation(
    () => api.post(`/admin/pages/${pageId}/sections`, { type, settings: {}, content: {} }),
    [`/admin/pages/${pageId}`, '/admin/pages'],
    { onSuccess: onClose, onError: (caught) => setError(caught.message) },
  );

  return (
    <Modal
      open
      onClose={onClose}
      title="Add a section"
      description="Choose a section type. Its content is edited after it is added."
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              setError(null);
              mutation.mutate(undefined as never);
            }}
            isLoading={mutation.isPending}
          >
            Add section
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error ? <Alert tone="danger">{error}</Alert> : null}

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Section type">
          {SECTION_TYPES.map((sectionType) => (
            <button
              key={sectionType}
              type="button"
              role="radio"
              aria-checked={type === sectionType}
              onClick={() => setType(sectionType)}
              className={cn(
                'rounded-lg border px-3 py-2.5 text-left text-sm transition-colors',
                type === sectionType
                  ? 'border-primary bg-primary-soft font-medium text-primary'
                  : 'border-border text-text-secondary hover:border-border-strong',
              )}
            >
              {SECTION_LABELS[sectionType] ?? sectionType}
            </button>
          ))}
        </div>

        {type === 'HTML' ? (
          <Alert tone="warning">
            Custom HTML is sanitised on the server against a strict allowlist. Scripts, iframes and
            event handlers are stripped, so use a dedicated section type where one exists.
          </Alert>
        ) : null}
      </div>
    </Modal>
  );
}

/* --------------------------------------------------------------- settings */

function SettingsTab({ page, locale }: { page: PageDto; locale: string }) {
  const [form, setForm] = useState({
    title: page.title,
    slug: page.slug,
    template: page.template,
    isEnabled: page.isEnabled,
  });
  const [status, setStatus] = useState<'idle' | 'saved'>('idle');
  const [error, setError] = useState<string | null>(null);

  const mutation = useApiMutation(
    () =>
      api.patch(`/admin/pages/${page.id}`, {
        title: form.title,
        ...(page.isSystem ? {} : { slug: form.slug }),
        template: form.template,
        isEnabled: form.isEnabled,
      }),
    [`/admin/pages/${page.id}`, '/admin/pages'],
    { onSuccess: () => setStatus('saved'), onError: (caught) => setError(caught.message) },
  );

  return (
    <div className="max-w-2xl space-y-5">
      {status === 'saved' ? <Alert tone="success">Page settings saved.</Alert> : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Card>
        <div className="space-y-5 p-5">
          <Input
            label="Page title"
            required
            value={form.title}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
          />

          <Input
            label="URL slug"
            disabled={page.isSystem}
            hint={
              page.isSystem
                ? 'System pages back a fixed route, so their slug cannot change.'
                : `Public URL: /${locale}/${form.slug}`
            }
            value={form.slug}
            onChange={(event) => setForm({ ...form, slug: event.target.value })}
          />

          <Select
            label="Template"
            value={form.template}
            onChange={(event) => setForm({ ...form, template: event.target.value })}
            options={[
              { value: 'default', label: 'Default' },
              { value: 'landing', label: 'Landing page' },
              { value: 'legal', label: 'Legal / long form' },
              { value: 'full-width', label: 'Full width' },
            ]}
          />

          <Checkbox
            label="Enabled — a disabled page returns 404 even when published"
            checked={form.isEnabled}
            onChange={(event) => setForm({ ...form, isEnabled: event.target.checked })}
          />
        </div>
      </Card>

      <div className="flex justify-end">
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
    </div>
  );
}

function SeoTab({ page }: { page: PageDto }) {
  const [seo, setSeo] = useState<SeoFormValue>(() => emptySeoForm(page.seo));
  const [status, setStatus] = useState<'idle' | 'saved'>('idle');
  const [error, setError] = useState<string | null>(null);

  const mutation = useApiMutation(
    () => api.patch(`/admin/pages/${page.id}`, { seo: toSeoPayload(seo) }),
    [`/admin/pages/${page.id}`, '/admin/pages'],
    { onSuccess: () => setStatus('saved'), onError: (caught) => setError(caught.message) },
  );

  return (
    <div className="max-w-3xl space-y-5">
      {status === 'saved' ? <Alert tone="success">SEO metadata saved.</Alert> : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <SeoFields
        value={seo}
        onChange={setSeo}
        previewTitle={page.title}
        previewPath={page.slug === 'home' ? '/' : `/${page.slug}`}
      />

      <div className="flex justify-end">
        <Button
          onClick={() => {
            setStatus('idle');
            setError(null);
            mutation.mutate(undefined as never);
          }}
          isLoading={mutation.isPending}
        >
          Save SEO
        </Button>
      </div>
    </div>
  );
}
