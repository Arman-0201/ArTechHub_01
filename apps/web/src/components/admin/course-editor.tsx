'use client';

import { useState } from 'react';
import { Eye, Loader2, Save } from 'lucide-react';
import type { CategoryDto, CourseDetailDto, InstructorDto } from '@academy/types';
import { PERMISSIONS } from '@academy/types';
import { api, useApiList, useApiMutation, useApiResource } from '@/lib/api/hooks';
import { localePath } from '@/lib/i18n/config';
import { cn } from '@/lib/utils';
import { useAuth } from '@/components/providers';
import { Alert, Badge, Button, Card, Input, Select, Textarea } from '@/components/ui';
import { AdminPageHeader } from './primitives';
import { CourseCurriculumEditor } from './course-curriculum-editor';
import { SeoFields, type SeoFormValue } from './seo-fields';
import { MediaPickerField } from './media-picker';
import { RichTextEditor } from './rich-text-editor';
import { CourseAnalyticsPanel } from './course-analytics-panel';

type Tab = 'details' | 'curriculum' | 'seo' | 'analytics';

const TABS: { id: Tab; label: string }[] = [
  { id: 'details', label: 'Details' },
  { id: 'curriculum', label: 'Curriculum' },
  { id: 'seo', label: 'SEO' },
  { id: 'analytics', label: 'Analytics' },
];

/**
 * Course editor.
 *
 * Tabbed rather than one long form: a course has four genuinely separate
 * concerns, and saving details should not require scrolling past the whole
 * curriculum. Each tab owns its own save, so a slow curriculum edit never
 * blocks a quick title fix.
 */
export function CourseEditor({ locale, courseId }: { locale: string; courseId: string }) {
  const { can } = useAuth();
  const [tab, setTab] = useState<Tab>('details');

  const courseQuery = useApiResource<CourseDetailDto>(`/admin/courses/${courseId}`);
  const course = courseQuery.data;

  if (courseQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="size-6 animate-spin text-text-muted" aria-hidden="true" />
        <span className="sr-only">Loading course</span>
      </div>
    );
  }

  if (courseQuery.error || !course) {
    return (
      <>
        <AdminPageHeader
          title="Course"
          breadcrumb={{ label: 'Courses', href: localePath(locale, '/admin/courses') }}
        />
        <Alert tone="danger">{courseQuery.error?.message ?? 'Course not found.'}</Alert>
      </>
    );
  }

  const visibleTabs = TABS.filter(
    (entry) => entry.id !== 'analytics' || can(PERMISSIONS.ANALYTICS_READ),
  );

  return (
    <>
      <AdminPageHeader
        title={course.title}
        description={`/${course.slug}`}
        breadcrumb={{ label: 'Courses', href: localePath(locale, '/admin/courses') }}
        action={
          <div className="flex items-center gap-2">
            <Badge tone={course.status === 'PUBLISHED' ? 'success' : 'warning'}>
              {course.status.toLowerCase()}
            </Badge>
            <Button
              variant="outline"
              size="sm"
              href={localePath(locale, `/courses/${course.slug}`)}
            >
              <Eye className="size-3.5" aria-hidden="true" />
              Preview
            </Button>
            <PublishControl course={course} />
          </div>
        }
      />

      <div className="mb-6 border-b border-border">
        <nav aria-label="Course sections">
          <ul className="-mb-px flex gap-1 overflow-x-auto">
            {visibleTabs.map((entry) => (
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

      {tab === 'details' ? <CourseDetailsForm course={course} locale={locale} /> : null}
      {tab === 'curriculum' ? <CourseCurriculumEditor course={course} /> : null}
      {tab === 'seo' ? <CourseSeoForm course={course} /> : null}
      {tab === 'analytics' ? <CourseAnalyticsPanel courseId={course.id} locale={locale} /> : null}
    </>
  );
}

function PublishControl({ course }: { course: CourseDetailDto }) {
  const { can } = useAuth();
  const [error, setError] = useState<string | null>(null);

  const mutation = useApiMutation(
    (status: string) => api.put(`/admin/courses/${course.id}/status`, { status }),
    ['/admin/courses'],
    { onError: (caught) => setError(caught.message) },
  );

  if (!can(PERMISSIONS.COURSES_PUBLISH)) return null;

  const isPublished = course.status === 'PUBLISHED';

  return (
    <div className="relative">
      <Button
        size="sm"
        variant={isPublished ? 'secondary' : 'primary'}
        onClick={() => {
          setError(null);
          mutation.mutate(isPublished ? 'DRAFT' : 'PUBLISHED');
        }}
        isLoading={mutation.isPending}
      >
        {isPublished ? 'Unpublish' : 'Publish'}
      </Button>

      {error ? (
        <p role="alert" className="absolute right-0 top-full z-10 mt-1 w-64 rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function CourseDetailsForm({ course, locale }: { course: CourseDetailDto; locale: string }) {
  const categoriesQuery = useApiList<CategoryDto>('/admin/categories', { pageSize: 100 });
  const instructorsQuery = useApiList<InstructorDto>('/admin/instructors');

  const [form, setForm] = useState({
    title: course.title,
    slug: course.slug,
    summary: course.summary ?? '',
    description: course.description,
    thumbnailMediaId: null as string | null,
    categoryId: course.category?.id ?? '',
    level: course.level as string,
    accessType: course.accessType as string,
    priceCents: course.priceCents ?? 0,
    currency: course.currency ?? 'USD',
    language: course.language,
    learningOutcomes: course.learningOutcomes.join('\n'),
    requirements: course.requirements.join('\n'),
    tags: course.tags.join(', '),
    instructorIds: course.instructors.map((instructor) => instructor.id),
    isFeatured: course.isFeatured,
  });

  const [status, setStatus] = useState<'idle' | 'saved'>('idle');
  const [error, setError] = useState<string | null>(null);

  const mutation = useApiMutation(
    () =>
      api.patch(`/admin/courses/${course.id}`, {
        title: form.title,
        slug: form.slug,
        summary: form.summary || null,
        description: form.description,
        ...(form.thumbnailMediaId !== null ? { thumbnailMediaId: form.thumbnailMediaId } : {}),
        categoryId: form.categoryId || null,
        level: form.level,
        accessType: form.accessType,
        priceCents: form.accessType === 'PAID' ? form.priceCents : null,
        currency: form.accessType === 'PAID' ? form.currency : null,
        language: form.language,
        // Multi-line text areas are the most natural editor for short lists;
        // they are split back into arrays on the way out.
        learningOutcomes: form.learningOutcomes
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean),
        requirements: form.requirements
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean),
        tags: form.tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
        instructorIds: form.instructorIds,
        isFeatured: form.isFeatured,
      }),
    ['/admin/courses'],
    {
      onSuccess: () => {
        setStatus('saved');
        setError(null);
      },
      onError: (caught) => {
        setStatus('idle');
        setError(caught.message);
      },
    },
  );

  const categories = categoriesQuery.data?.items ?? [];
  const instructors = instructorsQuery.data?.items ?? [];

  return (
    <div className="space-y-6">
      {status === 'saved' ? <Alert tone="success">Course saved.</Alert> : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card>
            <div className="space-y-5 p-5">
              <h2 className="text-base font-semibold text-text-primary">Basics</h2>

              <Input
                label="Title"
                required
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
              />

              <Input
                label="URL slug"
                required
                hint={`Public URL: /${locale}/courses/${form.slug}`}
                value={form.slug}
                onChange={(event) => setForm({ ...form, slug: event.target.value })}
              />

              <Textarea
                label="Summary"
                rows={3}
                hint="Shown on the course card and in search results."
                value={form.summary}
                onChange={(event) => setForm({ ...form, summary: event.target.value })}
              />
            </div>
          </Card>

          <Card>
            <div className="space-y-4 p-5">
              <div>
                <h2 className="text-base font-semibold text-text-primary">Description</h2>
                <p className="text-sm text-text-muted">
                  The long-form introduction shown on the course page.
                </p>
              </div>
              <RichTextEditor
                value={form.description}
                onChange={(document) => setForm({ ...form, description: document })}
              />
            </div>
          </Card>

          <Card>
            <div className="space-y-5 p-5">
              <h2 className="text-base font-semibold text-text-primary">Outcomes and requirements</h2>

              <Textarea
                label="What learners will be able to do"
                rows={5}
                hint="One outcome per line."
                value={form.learningOutcomes}
                onChange={(event) => setForm({ ...form, learningOutcomes: event.target.value })}
              />

              <Textarea
                label="Requirements"
                rows={4}
                hint="One requirement per line."
                value={form.requirements}
                onChange={(event) => setForm({ ...form, requirements: event.target.value })}
              />
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <div className="space-y-5 p-5">
              <h2 className="text-base font-semibold text-text-primary">Thumbnail</h2>
              <MediaPickerField
                kind="IMAGE"
                currentUrl={course.thumbnailUrl}
                onSelect={(media) => setForm({ ...form, thumbnailMediaId: media?.id ?? null })}
              />
            </div>
          </Card>

          <Card>
            <div className="space-y-5 p-5">
              <h2 className="text-base font-semibold text-text-primary">Classification</h2>

              <Select
                label="Category"
                value={form.categoryId}
                onChange={(event) => setForm({ ...form, categoryId: event.target.value })}
                placeholder="No category"
                options={categories.map((category) => ({
                  value: category.id,
                  label: category.name,
                }))}
              />

              <Select
                label="Level"
                value={form.level}
                onChange={(event) => setForm({ ...form, level: event.target.value })}
                options={[
                  { value: 'BEGINNER', label: 'Beginner' },
                  { value: 'INTERMEDIATE', label: 'Intermediate' },
                  { value: 'ADVANCED', label: 'Advanced' },
                  { value: 'EXPERT', label: 'Expert' },
                ]}
              />

              <Input
                label="Tags"
                hint="Comma separated."
                value={form.tags}
                onChange={(event) => setForm({ ...form, tags: event.target.value })}
              />

              <fieldset>
                <legend className="mb-2 text-sm font-medium text-text-primary">Instructors</legend>
                <div className="space-y-2 rounded-lg border border-border p-3">
                  {instructors.length === 0 ? (
                    <p className="text-xs text-text-muted">No instructor profiles yet.</p>
                  ) : (
                    instructors.map((instructor) => (
                      <label key={instructor.id} className="flex cursor-pointer items-center gap-2.5 text-sm">
                        <input
                          type="checkbox"
                          checked={form.instructorIds.includes(instructor.id)}
                          onChange={(event) =>
                            setForm({
                              ...form,
                              instructorIds: event.target.checked
                                ? [...form.instructorIds, instructor.id]
                                : form.instructorIds.filter((id) => id !== instructor.id),
                            })
                          }
                          className="size-4 rounded border-border-strong text-primary"
                        />
                        <span className="text-text-secondary">{instructor.name}</span>
                      </label>
                    ))
                  )}
                </div>
              </fieldset>
            </div>
          </Card>

          <Card>
            <div className="space-y-5 p-5">
              <h2 className="text-base font-semibold text-text-primary">Access</h2>

              <Select
                label="Access type"
                value={form.accessType}
                onChange={(event) => setForm({ ...form, accessType: event.target.value })}
                options={[
                  { value: 'FREE', label: 'Free — anyone can enroll' },
                  { value: 'PAID', label: 'Paid — requires purchase' },
                  { value: 'INVITE_ONLY', label: 'Invite only — admin enrolls' },
                  { value: 'PRIVATE', label: 'Private — never self-serve' },
                ]}
              />

              {form.accessType === 'PAID' ? (
                <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-3">
                  <Input
                    label="Price"
                    type="number"
                    min={0}
                    step={1}
                    hint="In minor units (cents)."
                    value={form.priceCents}
                    onChange={(event) =>
                      setForm({ ...form, priceCents: Number(event.target.value) || 0 })
                    }
                  />
                  <Input
                    label="Currency"
                    maxLength={3}
                    value={form.currency}
                    onChange={(event) =>
                      setForm({ ...form, currency: event.target.value.toUpperCase() })
                    }
                  />
                </div>
              ) : null}

              <label className="flex cursor-pointer items-center gap-2.5 text-sm">
                <input
                  type="checkbox"
                  checked={form.isFeatured}
                  onChange={(event) => setForm({ ...form, isFeatured: event.target.checked })}
                  className="size-4 rounded border-border-strong text-primary"
                />
                <span className="text-text-secondary">Feature on the home page</span>
              </label>
            </div>
          </Card>
        </div>
      </div>

      <div className="sticky bottom-0 -mx-4 flex justify-end border-t border-border bg-background/90 px-4 py-3 backdrop-blur-sm sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <Button
          onClick={() => {
            setStatus('idle');
            setError(null);
            mutation.mutate(undefined as never);
          }}
          isLoading={mutation.isPending}
        >
          <Save className="size-4" aria-hidden="true" />
          Save course
        </Button>
      </div>
    </div>
  );
}

function CourseSeoForm({ course }: { course: CourseDetailDto }) {
  const [seo, setSeo] = useState<SeoFormValue>({
    title: course.seo?.title ?? '',
    description: course.seo?.description ?? '',
    keywords: course.seo?.keywords.join(', ') ?? '',
    canonicalUrl: course.seo?.canonicalUrl ?? '',
    ogTitle: course.seo?.ogTitle ?? '',
    ogDescription: course.seo?.ogDescription ?? '',
    ogImageUrl: course.seo?.ogImageUrl ?? '',
    robots: course.seo?.robots ?? 'index, follow',
  });

  const [status, setStatus] = useState<'idle' | 'saved'>('idle');
  const [error, setError] = useState<string | null>(null);

  const mutation = useApiMutation(
    () =>
      api.patch(`/admin/courses/${course.id}`, {
        seo: {
          title: seo.title || null,
          description: seo.description || null,
          keywords: seo.keywords
            .split(',')
            .map((keyword) => keyword.trim())
            .filter(Boolean),
          canonicalUrl: seo.canonicalUrl || null,
          ogTitle: seo.ogTitle || null,
          ogDescription: seo.ogDescription || null,
          ogImageUrl: seo.ogImageUrl || null,
          robots: seo.robots || null,
        },
      }),
    ['/admin/courses'],
    {
      onSuccess: () => setStatus('saved'),
      onError: (caught) => setError(caught.message),
    },
  );

  return (
    <div className="max-w-3xl space-y-5">
      {status === 'saved' ? <Alert tone="success">SEO metadata saved.</Alert> : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <SeoFields
        value={seo}
        onChange={setSeo}
        previewTitle={course.title}
        previewPath={`/courses/${course.slug}`}
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
