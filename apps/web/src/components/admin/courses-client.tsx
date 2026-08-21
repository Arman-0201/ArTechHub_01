'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BarChart3, Copy, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import type { CourseCardDto } from '@academy/types';
import { PERMISSIONS } from '@academy/types';
import { api, useApiList, useApiMutation } from '@/lib/api/hooks';
import { localePath } from '@/lib/i18n/config';
import { formatDate, formatNumber } from '@/lib/utils';
import { useAuth } from '@/components/providers';
import { Alert, Badge, Button, Input, Select } from '@/components/ui';
import {
  AdminPageHeader,
  ConfirmDialog,
  DataTable,
  Modal,
  TableCell,
  TableRow,
} from './primitives';
import { ClientPagination } from './users-client';

const STATUS_TONES = {
  PUBLISHED: 'success',
  DRAFT: 'warning',
  ARCHIVED: 'neutral',
  DISABLED: 'danger',
} as const;

export function CoursesClient({ locale }: { locale: string }) {
  const router = useRouter();
  const { can } = useAuth();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<CourseCardDto | null>(null);

  const coursesQuery = useApiList<CourseCardDto>('/admin/courses', {
    page,
    pageSize: 20,
    search: search || undefined,
    status: status || undefined,
  });

  const canCreate = can(PERMISSIONS.COURSES_CREATE);
  const canUpdate = can(PERMISSIONS.COURSES_UPDATE);
  const canDelete = can(PERMISSIONS.COURSES_DELETE);

  const duplicateMutation = useApiMutation(
    (course: CourseCardDto) => api.post<{ id: string }>(`/admin/courses/${course.id}/duplicate`),
    ['/admin/courses'],
    { onSuccess: (created) => router.push(localePath(locale, `/admin/courses/${created.id}`)) },
  );

  const deleteMutation = useApiMutation(
    (course: CourseCardDto) => api.delete(`/admin/courses/${course.id}`),
    ['/admin/courses'],
    { onSuccess: () => setDeleting(null) },
  );

  return (
    <>
      <AdminPageHeader
        title="Courses"
        description="Create, structure and publish course content."
        action={
          canCreate ? (
            <Button onClick={() => setCreating(true)}>
              <Plus className="size-4" aria-hidden="true" />
              New course
            </Button>
          ) : undefined
        }
      />

      <div className="mb-5 flex flex-col gap-3 sm:flex-row">
        <Input
          type="search"
          placeholder="Search courses…"
          aria-label="Search courses"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          leadingIcon={<Search className="size-4" />}
          containerClassName="flex-1"
        />
        <Select
          aria-label="Filter by status"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
          placeholder="All statuses"
          options={[
            { value: 'PUBLISHED', label: 'Published' },
            { value: 'DRAFT', label: 'Draft' },
            { value: 'ARCHIVED', label: 'Archived' },
            { value: 'DISABLED', label: 'Disabled' },
          ]}
          containerClassName="sm:w-48"
        />
      </div>

      {coursesQuery.error ? (
        <Alert tone="danger" className="mb-4">
          {coursesQuery.error.message}
        </Alert>
      ) : null}

      <DataTable
        headers={['Course', 'Category', 'Status', 'Lessons', 'Enrolled', 'Published', '']}
        isLoading={coursesQuery.isLoading}
        isEmpty={(coursesQuery.data?.items.length ?? 0) === 0}
        emptyMessage="No courses match these filters."
      >
        {coursesQuery.data?.items.map((course) => (
          <TableRow key={course.id}>
            <TableCell>
              <div className="flex items-center gap-3">
                <div className="size-10 shrink-0 overflow-hidden rounded-md bg-surface-sunken">
                  {course.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={course.thumbnailUrl} alt="" className="size-full object-cover" />
                  ) : null}
                </div>
                <div className="min-w-0">
                  <Link
                    href={localePath(locale, `/admin/courses/${course.id}`)}
                    className="block truncate font-medium text-text-primary transition-colors hover:text-primary"
                  >
                    {course.title}
                  </Link>
                  <p className="truncate font-mono text-2xs text-text-muted">/{course.slug}</p>
                </div>
              </div>
            </TableCell>

            <TableCell className="text-xs">{course.category?.name ?? '—'}</TableCell>

            <TableCell>
              <Badge tone={STATUS_TONES[course.status as keyof typeof STATUS_TONES] ?? 'neutral'}>
                {course.status.toLowerCase()}
              </Badge>
            </TableCell>

            <TableCell className="text-xs">{course.lessonCount}</TableCell>

            <TableCell className="text-xs">
              {formatNumber(course.enrollmentCount, locale)}
            </TableCell>

            <TableCell className="whitespace-nowrap text-xs">
              {course.publishedAt ? formatDate(course.publishedAt, locale) : '—'}
            </TableCell>

            <TableCell align="right">
              <div className="flex justify-end gap-1">
                {can(PERMISSIONS.ANALYTICS_READ) ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    href={localePath(locale, `/admin/courses/${course.id}?tab=analytics`)}
                    aria-label={`Analytics for ${course.title}`}
                  >
                    <BarChart3 className="size-3.5" aria-hidden="true" />
                  </Button>
                ) : null}
                {canUpdate ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    href={localePath(locale, `/admin/courses/${course.id}`)}
                    aria-label={`Edit ${course.title}`}
                  >
                    <Pencil className="size-3.5" aria-hidden="true" />
                  </Button>
                ) : null}
                {canCreate ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => duplicateMutation.mutate(course)}
                    isLoading={
                      duplicateMutation.isPending && duplicateMutation.variables?.id === course.id
                    }
                    aria-label={`Duplicate ${course.title}`}
                  >
                    <Copy className="size-3.5" aria-hidden="true" />
                  </Button>
                ) : null}
                {canDelete ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setDeleting(course)}
                    aria-label={`Archive ${course.title}`}
                  >
                    <Trash2 className="size-3.5 text-danger" aria-hidden="true" />
                  </Button>
                ) : null}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </DataTable>

      {coursesQuery.data?.meta && coursesQuery.data.meta.totalPages > 1 ? (
        <ClientPagination meta={coursesQuery.data.meta} onPageChange={setPage} className="mt-5" />
      ) : null}

      {creating ? <CreateCourseModal locale={locale} onClose={() => setCreating(false)} /> : null}

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && deleteMutation.mutate(deleting)}
        title={`Archive ${deleting?.title ?? 'course'}`}
        message="The course is archived and removed from the public catalogue. Enrollments and learner progress are kept, and it can be restored."
        confirmLabel="Archive"
        isLoading={deleteMutation.isPending}
      />
    </>
  );
}

function CreateCourseModal({ locale, onClose }: { locale: string; onClose: () => void }) {
  const router = useRouter();
  const [form, setForm] = useState({ title: '', summary: '', level: 'BEGINNER' });
  const [error, setError] = useState<string | null>(null);

  const mutation = useApiMutation(
    () =>
      api.post<{ id: string }>('/admin/courses', {
        title: form.title,
        summary: form.summary || null,
        level: form.level,
        status: 'DRAFT',
      }),
    ['/admin/courses'],
    {
      // A new course opens straight into the editor — creating it in a dialog
      // and then leaving the admin on the list would just add a click.
      onSuccess: (course) => router.push(localePath(locale, `/admin/courses/${course.id}`)),
      onError: (caught) => setError(caught.message),
    },
  );

  return (
    <Modal
      open
      onClose={onClose}
      title="New course"
      description="Start with the essentials — everything else is set up in the editor."
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
            disabled={form.title.trim().length < 3}
          >
            Create and edit
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error ? <Alert tone="danger">{error}</Alert> : null}

        <Input
          label="Course title"
          required
          autoFocus
          value={form.title}
          onChange={(event) => setForm({ ...form, title: event.target.value })}
          hint="The URL slug is generated from this and can be changed later."
        />
        <Input
          label="Short summary"
          value={form.summary}
          onChange={(event) => setForm({ ...form, summary: event.target.value })}
          hint="One or two sentences shown on the course card."
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
      </div>
    </Modal>
  );
}
