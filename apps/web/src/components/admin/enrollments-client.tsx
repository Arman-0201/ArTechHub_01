'use client';

import { useState } from 'react';
import { ClipboardList, Plus, Search, Trash2 } from 'lucide-react';
import type { CourseCardDto, UserSummaryDto } from '@academy/types';
import { PERMISSIONS } from '@academy/types';
import { api, useApiList, useApiMutation } from '@/lib/api/hooks';
import { formatDate } from '@/lib/utils';
import { useAuth } from '@/components/providers';
import { Alert, Badge, Button, Input, ProgressBar, Select } from '@/components/ui';
import {
  AdminPageHeader,
  ConfirmDialog,
  DataTable,
  Modal,
  TableCell,
  TableRow,
} from './primitives';
import { ClientPagination } from './users-client';

interface AdminEnrollmentRow {
  id: string;
  status: string;
  source: string;
  enrolledAt: string;
  completedAt: string | null;
  progressPercent: number;
  user: { id: string; name: string; email: string };
  course: { id: string; title: string; slug: string };
}

const STATUS_TONES = {
  ACTIVE: 'primary',
  COMPLETED: 'success',
  CANCELLED: 'neutral',
  EXPIRED: 'warning',
} as const;

/**
 * Enrollment administration.
 *
 * The manual-enrollment path here is how paid, invite-only and private courses
 * are granted: self-service enrollment refuses those, but an administrator
 * acting deliberately can create one.
 */
export function EnrollmentsClient({ locale }: { locale: string }) {
  const { can } = useAuth();
  const canManage = can(PERMISSIONS.ENROLLMENTS_MANAGE);

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [creating, setCreating] = useState(false);
  const [cancelling, setCancelling] = useState<AdminEnrollmentRow | null>(null);

  const enrollmentsQuery = useApiList<AdminEnrollmentRow>('/admin/enrollments', {
    page,
    pageSize: 25,
    search: search || undefined,
    status: status || undefined,
  });

  const cancelMutation = useApiMutation(
    (row: AdminEnrollmentRow) =>
      api.delete(`/admin/enrollments/${row.user.id}/${row.course.id}`),
    ['/admin/enrollments'],
    { onSuccess: () => setCancelling(null) },
  );

  return (
    <>
      <AdminPageHeader
        title="Enrollments"
        description="Who is enrolled in what, and how far they have got."
        action={
          canManage ? (
            <Button onClick={() => setCreating(true)}>
              <Plus className="size-4" aria-hidden="true" />
              Enroll a learner
            </Button>
          ) : undefined
        }
      />

      <div className="mb-5 flex flex-col gap-3 sm:flex-row">
        <Input
          type="search"
          placeholder="Search by learner or course…"
          aria-label="Search enrollments"
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
            { value: 'ACTIVE', label: 'Active' },
            { value: 'COMPLETED', label: 'Completed' },
            { value: 'CANCELLED', label: 'Cancelled' },
            { value: 'EXPIRED', label: 'Expired' },
          ]}
          containerClassName="sm:w-48"
        />
      </div>

      {enrollmentsQuery.error ? (
        <Alert tone="danger" className="mb-4">
          {enrollmentsQuery.error.message}
        </Alert>
      ) : null}

      <DataTable
        headers={['Learner', 'Course', 'Progress', 'Status', 'Enrolled', '']}
        isLoading={enrollmentsQuery.isLoading}
        isEmpty={(enrollmentsQuery.data?.items.length ?? 0) === 0}
        emptyMessage="No enrollments match these filters."
      >
        {enrollmentsQuery.data?.items.map((row) => (
          <TableRow key={row.id}>
            <TableCell>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-text-primary">{row.user.name}</p>
                <p className="truncate text-2xs text-text-muted">{row.user.email}</p>
              </div>
            </TableCell>

            <TableCell>
              <p className="truncate text-sm text-text-secondary">{row.course.title}</p>
            </TableCell>

            <TableCell>
              <div className="flex min-w-32 items-center gap-2">
                <ProgressBar
                  value={row.progressPercent}
                  size="sm"
                  className="flex-1"
                  label={`${row.user.name}: ${row.progressPercent}%`}
                />
                <span className="shrink-0 text-2xs tabular-nums text-text-muted">
                  {row.progressPercent}%
                </span>
              </div>
            </TableCell>

            <TableCell>
              <div className="flex flex-col gap-1">
                <Badge tone={STATUS_TONES[row.status as keyof typeof STATUS_TONES] ?? 'neutral'}>
                  {row.status.toLowerCase()}
                </Badge>
                {row.source !== 'self' ? (
                  <span className="text-2xs text-text-muted">via {row.source}</span>
                ) : null}
              </div>
            </TableCell>

            <TableCell className="whitespace-nowrap text-xs">
              {formatDate(row.enrolledAt, locale)}
            </TableCell>

            <TableCell align="right">
              {canManage && row.status !== 'CANCELLED' ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setCancelling(row)}
                  aria-label={`Cancel ${row.user.name}'s enrollment`}
                >
                  <Trash2 className="size-3.5 text-danger" aria-hidden="true" />
                </Button>
              ) : null}
            </TableCell>
          </TableRow>
        ))}
      </DataTable>

      {enrollmentsQuery.data?.meta && enrollmentsQuery.data.meta.totalPages > 1 ? (
        <ClientPagination
          meta={enrollmentsQuery.data.meta}
          onPageChange={setPage}
          className="mt-5"
        />
      ) : null}

      {creating ? <ManualEnrollModal onClose={() => setCreating(false)} /> : null}

      <ConfirmDialog
        open={Boolean(cancelling)}
        onClose={() => setCancelling(null)}
        onConfirm={() => cancelling && cancelMutation.mutate(cancelling)}
        title="Cancel enrollment"
        message="The learner loses access to the course. Their recorded progress is kept, so re-enrolling restores it."
        confirmLabel="Cancel enrollment"
        isLoading={cancelMutation.isPending}
      />
    </>
  );
}

function ManualEnrollModal({ onClose }: { onClose: () => void }) {
  const [userSearch, setUserSearch] = useState('');
  const [courseSearch, setCourseSearch] = useState('');
  const [userId, setUserId] = useState('');
  const [courseId, setCourseId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const usersQuery = useApiList<UserSummaryDto>('/admin/users', {
    pageSize: 10,
    search: userSearch || undefined,
  });
  const coursesQuery = useApiList<CourseCardDto>('/admin/courses', {
    pageSize: 10,
    search: courseSearch || undefined,
  });

  const mutation = useApiMutation(
    () => api.post('/admin/enrollments', { userId, courseId }),
    ['/admin/enrollments'],
    { onSuccess: onClose, onError: (caught) => setError(caught.message) },
  );

  return (
    <Modal
      open
      onClose={onClose}
      title="Enroll a learner"
      description="Manual enrollment bypasses the self-service rules, so it works for paid and invite-only courses."
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
            disabled={!userId || !courseId}
          >
            Enroll
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {error ? <Alert tone="danger">{error}</Alert> : null}

        <div className="space-y-2">
          <Input
            label="Find a learner"
            type="search"
            placeholder="Search by name or email…"
            value={userSearch}
            onChange={(event) => setUserSearch(event.target.value)}
            leadingIcon={<Search className="size-4" />}
          />
          <ul className="max-h-40 overflow-y-auto rounded-lg border border-border">
            {usersQuery.data?.items.map((user) => (
              <li key={user.id}>
                <button
                  type="button"
                  onClick={() => setUserId(user.id)}
                  className={
                    userId === user.id
                      ? 'flex w-full items-center gap-2 bg-primary-soft px-3 py-2 text-left text-sm text-primary'
                      : 'flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text-secondary hover:bg-surface-sunken'
                  }
                >
                  <span className="min-w-0 flex-1 truncate">{user.name}</span>
                  <span className="shrink-0 text-2xs text-text-muted">{user.email}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-2">
          <Input
            label="Find a course"
            type="search"
            placeholder="Search courses…"
            value={courseSearch}
            onChange={(event) => setCourseSearch(event.target.value)}
            leadingIcon={<Search className="size-4" />}
          />
          <ul className="max-h-40 overflow-y-auto rounded-lg border border-border">
            {coursesQuery.data?.items.map((course) => (
              <li key={course.id}>
                <button
                  type="button"
                  onClick={() => setCourseId(course.id)}
                  className={
                    courseId === course.id
                      ? 'flex w-full items-center gap-2 bg-primary-soft px-3 py-2 text-left text-sm text-primary'
                      : 'flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text-secondary hover:bg-surface-sunken'
                  }
                >
                  <span className="min-w-0 flex-1 truncate">{course.title}</span>
                  <Badge tone="neutral">{course.accessType.toLowerCase()}</Badge>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Modal>
  );
}
