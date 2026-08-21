'use client';

import { useState } from 'react';
import { ChevronDown, FileText, FileUp, Pencil, Plus, Trash2 } from 'lucide-react';
import type { CourseDetailDto, LessonSummaryDto, ModuleSummaryDto } from '@academy/types';
import { api, useApiMutation } from '@/lib/api/hooks';
import { cn, formatDuration } from '@/lib/utils';
import { Alert, Badge, Button, Card, Input, Textarea } from '@/components/ui';
import { ConfirmDialog, Modal } from './primitives';
import { SortableList } from './sortable-list';
import { LessonEditorModal } from './lesson-editor';
import { PdfImportModal } from './pdf-import-modal';

/**
 * Curriculum editor.
 *
 * Modules and lessons are reordered by drag-and-drop (or keyboard), and every
 * reorder is persisted immediately — an explicit "save order" button is the
 * kind of step people forget, leaving the visible order and the stored order
 * disagreeing.
 */
export function CourseCurriculumEditor({ course }: { course: CourseDetailDto }) {
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(course.modules.map((module) => module.id)),
  );
  const [creatingModule, setCreatingModule] = useState(false);
  const [editingModule, setEditingModule] = useState<ModuleSummaryDto | null>(null);
  const [deletingModule, setDeletingModule] = useState<ModuleSummaryDto | null>(null);
  const [lessonContext, setLessonContext] = useState<{
    moduleId: string;
    lesson?: LessonSummaryDto;
  } | null>(null);
  const [importingInto, setImportingInto] = useState<string | null>(null);
  const [deletingLesson, setDeletingLesson] = useState<LessonSummaryDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  const invalidate = [`/admin/courses/${course.id}`, '/admin/courses'];

  const reorderModules = useApiMutation(
    (orderedIds: string[]) =>
      api.put(`/admin/courses/${course.id}/modules/reorder`, {
        items: orderedIds.map((id, index) => ({ id, sortOrder: index })),
      }),
    invalidate,
    { onError: (caught) => setError(caught.message) },
  );

  const reorderLessons = useApiMutation(
    ({ moduleId, orderedIds }: { moduleId: string; orderedIds: string[] }) =>
      api.put(`/admin/modules/${moduleId}/lessons/reorder`, {
        items: orderedIds.map((id, index) => ({ id, sortOrder: index })),
      }),
    invalidate,
    { onError: (caught) => setError(caught.message) },
  );

  const deleteModuleMutation = useApiMutation(
    (module: ModuleSummaryDto) => api.delete(`/admin/modules/${module.id}`),
    invalidate,
    { onSuccess: () => setDeletingModule(null), onError: (caught) => setError(caught.message) },
  );

  const deleteLessonMutation = useApiMutation(
    (lesson: LessonSummaryDto) => api.delete(`/admin/lessons/${lesson.id}`),
    invalidate,
    { onSuccess: () => setDeletingLesson(null), onError: (caught) => setError(caught.message) },
  );

  function toggle(moduleId: string) {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(moduleId)) next.delete(moduleId);
      else next.add(moduleId);
      return next;
    });
  }

  return (
    <div className="max-w-4xl space-y-5">
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-text-muted">
          {course.modules.length} {course.modules.length === 1 ? 'module' : 'modules'} ·{' '}
          {course.modules.reduce((total, module) => total + module.lessons.length, 0)} lessons
        </p>
        <Button size="sm" onClick={() => setCreatingModule(true)}>
          <Plus className="size-4" aria-hidden="true" />
          Add module
        </Button>
      </div>

      {course.modules.length === 0 ? (
        <Card>
          <div className="p-10 text-center">
            <p className="text-text-secondary">This course has no modules yet.</p>
            <Button className="mt-4" onClick={() => setCreatingModule(true)}>
              <Plus className="size-4" aria-hidden="true" />
              Add the first module
            </Button>
          </div>
        </Card>
      ) : (
        <SortableList
          items={course.modules}
          itemLabel={(module) => module.title}
          onReorder={(orderedIds) => reorderModules.mutate(orderedIds)}
          renderItem={(module, index) => {
            const isOpen = expanded.has(module.id);
            const panelId = `curriculum-module-${module.id}`;

            return (
              <div className="pr-2">
                <div className="flex items-center gap-2 py-1">
                  <button
                    type="button"
                    onClick={() => toggle(module.id)}
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1 text-left transition-colors hover:bg-surface-sunken"
                  >
                    <ChevronDown
                      className={cn(
                        'size-4 shrink-0 text-text-muted transition-transform',
                        isOpen && 'rotate-180',
                      )}
                      aria-hidden="true"
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-text-primary">
                        {index + 1}. {module.title}
                      </span>
                      <span className="block text-2xs text-text-muted">
                        {module.lessons.length}{' '}
                        {module.lessons.length === 1 ? 'lesson' : 'lessons'}
                      </span>
                    </span>
                  </button>

                  <div className="flex shrink-0 gap-0.5">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setImportingInto(module.id)}
                      aria-label={`Import a PDF into ${module.title}`}
                      title="Import from PDF"
                    >
                      <FileUp className="size-3.5" aria-hidden="true" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditingModule(module)}
                      aria-label={`Edit ${module.title}`}
                    >
                      <Pencil className="size-3.5" aria-hidden="true" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDeletingModule(module)}
                      aria-label={`Delete ${module.title}`}
                    >
                      <Trash2 className="size-3.5 text-danger" aria-hidden="true" />
                    </Button>
                  </div>
                </div>

                <div id={panelId} hidden={!isOpen} className="mt-2 space-y-2 pl-6">
                  {module.lessons.length > 0 ? (
                    <SortableList
                      items={module.lessons}
                      itemLabel={(lesson) => lesson.title}
                      onReorder={(orderedIds) =>
                        reorderLessons.mutate({ moduleId: module.id, orderedIds })
                      }
                      renderItem={(lesson) => (
                        <div className="flex items-center gap-2 pr-2">
                          <FileText
                            className="size-3.5 shrink-0 text-text-muted"
                            aria-hidden="true"
                          />
                          <span className="min-w-0 flex-1 truncate text-sm text-text-secondary">
                            {lesson.title}
                          </span>

                          <div className="flex shrink-0 items-center gap-1.5">
                            {lesson.isPreview ? <Badge tone="accent">Preview</Badge> : null}
                            {!lesson.isPublished ? <Badge tone="warning">Draft</Badge> : null}
                            {lesson.durationMinutes ? (
                              <span className="text-2xs text-text-muted">
                                {formatDuration(lesson.durationMinutes)}
                              </span>
                            ) : null}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setLessonContext({ moduleId: module.id, lesson })}
                              aria-label={`Edit ${lesson.title}`}
                            >
                              <Pencil className="size-3.5" aria-hidden="true" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setDeletingLesson(lesson)}
                              aria-label={`Delete ${lesson.title}`}
                            >
                              <Trash2 className="size-3.5 text-danger" aria-hidden="true" />
                            </Button>
                          </div>
                        </div>
                      )}
                    />
                  ) : (
                    <p className="px-2 py-3 text-xs text-text-muted">No lessons in this module.</p>
                  )}

                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setLessonContext({ moduleId: module.id })}
                  >
                    <Plus className="size-3.5" aria-hidden="true" />
                    Add lesson
                  </Button>
                </div>
              </div>
            );
          }}
        />
      )}

      {creatingModule ? (
        <ModuleModal courseId={course.id} onClose={() => setCreatingModule(false)} />
      ) : null}

      {editingModule ? (
        <ModuleModal
          courseId={course.id}
          module={editingModule}
          onClose={() => setEditingModule(null)}
        />
      ) : null}

      {lessonContext ? (
        <LessonEditorModal
          courseId={course.id}
          moduleId={lessonContext.moduleId}
          lessonId={lessonContext.lesson?.id}
          onClose={() => setLessonContext(null)}
        />
      ) : null}

      {importingInto ? (
        <PdfImportModal
          courseId={course.id}
          moduleId={importingInto}
          onClose={() => setImportingInto(null)}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(deletingModule)}
        onClose={() => setDeletingModule(null)}
        onConfirm={() => deletingModule && deleteModuleMutation.mutate(deletingModule)}
        title={`Delete ${deletingModule?.title ?? 'module'}`}
        message="Every lesson in this module is deleted too, along with learner progress against them. This cannot be undone."
        isLoading={deleteModuleMutation.isPending}
      />

      <ConfirmDialog
        open={Boolean(deletingLesson)}
        onClose={() => setDeletingLesson(null)}
        onConfirm={() => deletingLesson && deleteLessonMutation.mutate(deletingLesson)}
        title={`Delete ${deletingLesson?.title ?? 'lesson'}`}
        message="This lesson and any learner progress against it are removed. This cannot be undone."
        isLoading={deleteLessonMutation.isPending}
      />
    </div>
  );
}

function ModuleModal({
  courseId,
  module,
  onClose,
}: {
  courseId: string;
  module?: ModuleSummaryDto;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(module?.title ?? '');
  const [summary, setSummary] = useState(module?.summary ?? '');
  const [error, setError] = useState<string | null>(null);

  const mutation = useApiMutation(
    () => {
      const payload = { title, summary: summary || null };
      return module
        ? api.patch(`/admin/modules/${module.id}`, payload)
        : api.post(`/admin/courses/${courseId}/modules`, payload);
    },
    [`/admin/courses/${courseId}`, '/admin/courses'],
    { onSuccess: onClose, onError: (caught) => setError(caught.message) },
  );

  return (
    <Modal
      open
      onClose={onClose}
      title={module ? 'Edit module' : 'New module'}
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
            disabled={title.trim().length < 2}
          >
            {module ? 'Save module' : 'Add module'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error ? <Alert tone="danger">{error}</Alert> : null}

        <Input
          label="Module title"
          required
          autoFocus
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <Textarea
          label="Summary"
          rows={2}
          hint="Optional. Shown under the module heading on the course page."
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
        />
      </div>
    </Modal>
  );
}
