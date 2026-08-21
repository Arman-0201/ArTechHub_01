'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { LessonDetailDto, RichTextDocument } from '@academy/types';
import { api, useApiMutation, useApiResource } from '@/lib/api/hooks';
import { Alert, Button, Checkbox, Input, Select, Textarea } from '@/components/ui';
import { Modal } from './primitives';
import { RichTextEditor } from './rich-text-editor';
import { MediaPickerButton } from './media-picker';

interface LessonFormState {
  title: string;
  slug: string;
  summary: string;
  type: string;
  body: RichTextDocument | null;
  videoUrl: string;
  videoProvider: string;
  durationMinutes: string;
  isPreview: boolean;
  isPublished: boolean;
}

const EMPTY_FORM: LessonFormState = {
  title: '',
  slug: '',
  summary: '',
  type: 'ARTICLE',
  body: { type: 'doc', content: [] },
  videoUrl: '',
  videoProvider: 'file',
  durationMinutes: '',
  isPreview: false,
  isPublished: true,
};

/**
 * Lesson editor.
 *
 * Creating and editing share one form. On create the lesson is not fetched, so
 * the dialog opens instantly; on edit the full lesson (including its body) is
 * loaded first, because the list view only carries a summary.
 */
export function LessonEditorModal({
  courseId,
  moduleId,
  lessonId,
  onClose,
}: {
  courseId: string;
  moduleId: string;
  lessonId?: string;
  onClose: () => void;
}) {
  const isEditing = Boolean(lessonId);

  const lessonQuery = useApiResource<LessonDetailDto>(
    lessonId ? `/admin/lessons/${lessonId}` : null,
  );

  const [form, setForm] = useState<LessonFormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [isHydrated, setIsHydrated] = useState(!isEditing);

  useEffect(() => {
    const lesson = lessonQuery.data;
    if (!lesson || isHydrated) return;

    setForm({
      title: lesson.title,
      slug: lesson.slug,
      summary: lesson.summary ?? '',
      type: lesson.type,
      body: lesson.body ?? { type: 'doc', content: [] },
      videoUrl: lesson.video?.url ?? '',
      videoProvider: lesson.video?.provider ?? 'file',
      durationMinutes: lesson.durationMinutes ? String(lesson.durationMinutes) : '',
      isPreview: lesson.isPreview,
      isPublished: true,
    });
    setIsHydrated(true);
  }, [lessonQuery.data, isHydrated]);

  const mutation = useApiMutation(
    () => {
      const payload = {
        title: form.title,
        ...(form.slug ? { slug: form.slug } : {}),
        summary: form.summary || null,
        type: form.type,
        body: form.body,
        video: form.videoUrl
          ? { url: form.videoUrl, provider: form.videoProvider }
          : null,
        durationMinutes: form.durationMinutes ? Number(form.durationMinutes) : null,
        isPreview: form.isPreview,
        isPublished: form.isPublished,
      };

      return lessonId
        ? api.patch(`/admin/lessons/${lessonId}`, payload)
        : api.post('/admin/lessons', { ...payload, moduleId });
    },
    [`/admin/courses/${courseId}`, '/admin/courses', '/admin/lessons'],
    { onSuccess: onClose, onError: (caught) => setError(caught.message) },
  );

  const isLoading = isEditing && lessonQuery.isLoading;

  return (
    <Modal
      open
      onClose={onClose}
      title={isEditing ? 'Edit lesson' : 'New lesson'}
      size="xl"
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
            disabled={isLoading || form.title.trim().length < 2}
          >
            {isEditing ? 'Save lesson' : 'Create lesson'}
          </Button>
        </>
      }
    >
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="size-6 animate-spin text-text-muted" aria-hidden="true" />
          <span className="sr-only">Loading lesson</span>
        </div>
      ) : (
        <div className="space-y-5">
          {error ? <Alert tone="danger">{error}</Alert> : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Lesson title"
              required
              autoFocus
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
            />
            <Input
              label="URL slug"
              hint="Generated from the title when left blank."
              value={form.slug}
              onChange={(event) => setForm({ ...form, slug: event.target.value })}
            />
          </div>

          <Textarea
            label="Summary"
            rows={2}
            hint="Shown under the lesson title. Optional."
            value={form.summary}
            onChange={(event) => setForm({ ...form, summary: event.target.value })}
          />

          <div className="grid gap-4 sm:grid-cols-3">
            <Select
              label="Lesson type"
              value={form.type}
              onChange={(event) => setForm({ ...form, type: event.target.value })}
              options={[
                { value: 'ARTICLE', label: 'Article' },
                { value: 'VIDEO', label: 'Video' },
                { value: 'PDF', label: 'PDF-derived' },
                { value: 'RESOURCE', label: 'Resource' },
              ]}
            />
            <Input
              label="Duration (minutes)"
              type="number"
              min={0}
              hint="Estimated from the text when blank."
              value={form.durationMinutes}
              onChange={(event) => setForm({ ...form, durationMinutes: event.target.value })}
            />
            <Select
              label="Video source"
              value={form.videoProvider}
              onChange={(event) => setForm({ ...form, videoProvider: event.target.value })}
              options={[
                { value: 'file', label: 'Uploaded file' },
                { value: 'youtube', label: 'YouTube' },
                { value: 'vimeo', label: 'Vimeo' },
              ]}
            />
          </div>

          <div className="flex items-end gap-2">
            <Input
              label="Video URL"
              hint="Leave blank for a text-only lesson."
              value={form.videoUrl}
              onChange={(event) => setForm({ ...form, videoUrl: event.target.value })}
              containerClassName="flex-1"
            />
            {form.videoProvider === 'file' ? (
              <MediaPickerButton
                kind="VIDEO"
                onSelect={(media) => setForm({ ...form, videoUrl: media.url })}
              />
            ) : null}
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-text-primary">Lesson content</p>
            <RichTextEditor
              value={form.body}
              onChange={(document) => setForm({ ...form, body: document })}
              minBlocks={0}
            />
          </div>

          <div className="space-y-2.5 rounded-lg border border-border bg-surface-sunken p-4">
            <Checkbox
              label="Free preview — readable without enrolling"
              checked={form.isPreview}
              onChange={(event) => setForm({ ...form, isPreview: event.target.checked })}
            />
            <Checkbox
              label="Published — visible to enrolled learners"
              checked={form.isPublished}
              onChange={(event) => setForm({ ...form, isPublished: event.target.checked })}
            />
          </div>
        </div>
      )}
    </Modal>
  );
}
