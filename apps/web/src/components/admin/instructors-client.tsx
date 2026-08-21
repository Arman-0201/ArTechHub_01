'use client';

import { useState } from 'react';
import { Pencil, Plus, Trash2, Users } from 'lucide-react';
import type { InstructorDto } from '@academy/types';
import { PERMISSIONS } from '@academy/types';
import { api, useApiList, useApiMutation } from '@/lib/api/hooks';
import { colorFromString } from '@/lib/utils';
import { useAuth } from '@/components/providers';
import { Alert, Badge, Button, Card, Checkbox, Input, Textarea } from '@/components/ui';
import { AdminPageHeader, ConfirmDialog, Modal } from './primitives';
import { MediaPickerField } from './media-picker';

export function InstructorsClient() {
  const { can } = useAuth();
  const canManage = can(PERMISSIONS.COURSES_UPDATE);

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<InstructorDto | null>(null);
  const [deleting, setDeleting] = useState<InstructorDto | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const instructorsQuery = useApiList<InstructorDto>('/admin/instructors');

  const deleteMutation = useApiMutation(
    (instructor: InstructorDto) => api.delete(`/admin/instructors/${instructor.id}`),
    ['/admin/instructors'],
    {
      onSuccess: () => {
        setDeleting(null);
        setDeleteError(null);
      },
      onError: (error) => setDeleteError(error.message),
    },
  );

  return (
    <>
      <AdminPageHeader
        title="Instructors"
        description="Public author profiles shown on courses and the instructor directory."
        action={
          canManage ? (
            <Button onClick={() => setCreating(true)}>
              <Plus className="size-4" aria-hidden="true" />
              New instructor
            </Button>
          ) : undefined
        }
      />

      {instructorsQuery.error ? (
        <Alert tone="danger" className="mb-4">
          {instructorsQuery.error.message}
        </Alert>
      ) : null}

      {(instructorsQuery.data?.items.length ?? 0) === 0 && !instructorsQuery.isLoading ? (
        <Card>
          <div className="p-12 text-center">
            <Users className="mx-auto size-8 text-text-muted" aria-hidden="true" />
            <p className="mt-3 text-text-secondary">No instructor profiles yet.</p>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {instructorsQuery.data?.items.map((instructor) => (
            <Card key={instructor.id}>
              <div className="space-y-3 p-5">
                <div className="flex items-start gap-3">
                  {instructor.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={instructor.avatarUrl}
                      alt=""
                      className="size-12 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <span
                      className="grid size-12 shrink-0 place-items-center rounded-full text-base font-semibold text-white"
                      style={{ backgroundColor: colorFromString(instructor.slug) }}
                      aria-hidden="true"
                    >
                      {instructor.name.slice(0, 1)}
                    </span>
                  )}

                  <div className="min-w-0 flex-1">
                    <h2 className="truncate font-semibold text-text-primary">{instructor.name}</h2>
                    {instructor.headline ? (
                      <p className="line-clamp-2 text-sm text-text-secondary">
                        {instructor.headline}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-border pt-3">
                  <Badge tone="neutral">
                    {instructor.courseCount ?? 0}{' '}
                    {instructor.courseCount === 1 ? 'course' : 'courses'}
                  </Badge>

                  {canManage ? (
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditing(instructor)}
                        aria-label={`Edit ${instructor.name}`}
                      >
                        <Pencil className="size-3.5" aria-hidden="true" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDeleting(instructor)}
                        aria-label={`Delete ${instructor.name}`}
                      >
                        <Trash2 className="size-3.5 text-danger" aria-hidden="true" />
                      </Button>
                    </div>
                  ) : null}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {creating ? <InstructorModal onClose={() => setCreating(false)} /> : null}
      {editing ? (
        <InstructorModal instructor={editing} onClose={() => setEditing(null)} />
      ) : null}

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => {
          setDeleting(null);
          setDeleteError(null);
        }}
        onConfirm={() => deleting && deleteMutation.mutate(deleting)}
        title={`Delete ${deleting?.name ?? 'instructor'}`}
        message={
          deleteError ??
          'Instructors assigned to a course cannot be deleted — deactivate them instead so published courses keep their author.'
        }
        isLoading={deleteMutation.isPending}
      />
    </>
  );
}

function InstructorModal({
  instructor,
  onClose,
}: {
  instructor?: InstructorDto;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    name: instructor?.name ?? '',
    slug: instructor?.slug ?? '',
    headline: instructor?.headline ?? '',
    bio: instructor?.bio ?? '',
    isActive: true,
    avatarMediaId: null as string | null,
  });
  const [links, setLinks] = useState(instructor?.links ?? []);
  const [error, setError] = useState<string | null>(null);

  const mutation = useApiMutation(
    () => {
      const payload = {
        name: form.name,
        ...(form.slug ? { slug: form.slug } : {}),
        headline: form.headline || null,
        bio: form.bio || null,
        isActive: form.isActive,
        links: links.filter((link) => link.label && link.url),
        ...(form.avatarMediaId !== null ? { avatarMediaId: form.avatarMediaId } : {}),
      };
      return instructor
        ? api.patch(`/admin/instructors/${instructor.id}`, payload)
        : api.post('/admin/instructors', payload);
    },
    ['/admin/instructors'],
    { onSuccess: onClose, onError: (caught) => setError(caught.message) },
  );

  return (
    <Modal
      open
      onClose={onClose}
      title={instructor ? `Edit ${instructor.name}` : 'New instructor'}
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
            disabled={form.name.trim().length < 2}
          >
            Save instructor
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error ? <Alert tone="danger">{error}</Alert> : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Name"
            required
            autoFocus
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
          <Input
            label="URL slug"
            hint="Generated from the name when blank."
            value={form.slug}
            onChange={(event) => setForm({ ...form, slug: event.target.value })}
          />
        </div>

        <Input
          label="Headline"
          hint="One line describing their expertise."
          value={form.headline}
          onChange={(event) => setForm({ ...form, headline: event.target.value })}
        />

        <Textarea
          label="Biography"
          rows={4}
          value={form.bio}
          onChange={(event) => setForm({ ...form, bio: event.target.value })}
        />

        <MediaPickerField
          label="Profile photo"
          kind="IMAGE"
          currentUrl={instructor?.avatarUrl ?? null}
          onSelect={(media) => setForm({ ...form, avatarMediaId: media?.id ?? null })}
        />

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium text-text-primary">Links</legend>
          {links.map((link, index) => (
            <div key={index} className="flex items-end gap-2">
              <Input
                aria-label={`Link label ${index + 1}`}
                placeholder="GitHub"
                value={link.label}
                onChange={(event) =>
                  setLinks(
                    links.map((entry, i) =>
                      i === index ? { ...entry, label: event.target.value } : entry,
                    ),
                  )
                }
                containerClassName="w-40"
              />
              <Input
                aria-label={`Link URL ${index + 1}`}
                placeholder="https://…"
                value={link.url}
                onChange={(event) =>
                  setLinks(
                    links.map((entry, i) =>
                      i === index ? { ...entry, url: event.target.value } : entry,
                    ),
                  )
                }
                containerClassName="flex-1"
              />
              <Button
                variant="ghost"
                onClick={() => setLinks(links.filter((_, i) => i !== index))}
                aria-label={`Remove link ${index + 1}`}
              >
                <Trash2 className="size-4 text-danger" aria-hidden="true" />
              </Button>
            </div>
          ))}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setLinks([...links, { label: '', url: '' }])}
          >
            <Plus className="size-3.5" aria-hidden="true" />
            Add link
          </Button>
        </fieldset>

        <Checkbox
          label="Active — shown in the public instructor directory"
          checked={form.isActive}
          onChange={(event) => setForm({ ...form, isActive: event.target.checked })}
        />
      </div>
    </Modal>
  );
}
