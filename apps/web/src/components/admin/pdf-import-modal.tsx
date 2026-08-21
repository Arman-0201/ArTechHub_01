'use client';

import { useState } from 'react';
import { FileText, Loader2, Upload } from 'lucide-react';
import type { MediaDto, RichTextDocument } from '@academy/types';
import { api, apiFetch, useApiMutation } from '@/lib/api/hooks';
import { Alert, Button, Checkbox, Input } from '@/components/ui';
import { RichText } from '@/components/content/rich-text';
import { Modal } from './primitives';

interface ExtractionResult {
  document: RichTextDocument;
  pageCount: number;
  title: string | null;
  warnings: string[];
  outline: { title: string; nodeIndex: number }[];
}

/**
 * PDF import.
 *
 * Three explicit steps — upload, preview, import — because extraction is a
 * heuristic. The admin sees exactly what the converter produced *before*
 * anything is written, and imported lessons are always created as drafts so
 * nothing half-converted can reach a learner.
 */
export function PdfImportModal({
  courseId,
  moduleId,
  onClose,
}: {
  courseId: string;
  moduleId: string;
  onClose: () => void;
}) {
  const [step, setStep] = useState<'upload' | 'preview' | 'done'>('upload');
  const [media, setMedia] = useState<MediaDto | null>(null);
  const [extraction, setExtraction] = useState<ExtractionResult | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [keepOriginal, setKeepOriginal] = useState(true);
  const [splitByHeadings, setSplitByHeadings] = useState(false);
  const [titleOverride, setTitleOverride] = useState('');
  const [result, setResult] = useState<{ lessons: { title: string }[]; warnings: string[] } | null>(
    null,
  );

  const previewMutation = useApiMutation(
    (mediaId: string) => api.post<ExtractionResult>('/admin/content/pdf/preview', { mediaId }),
    [],
    {
      onSuccess: (data) => {
        setExtraction(data);
        setTitleOverride(data.title ?? '');
        setStep('preview');
      },
      onError: (caught) => setError(caught.message),
    },
  );

  const importMutation = useApiMutation(
    () =>
      api.post<{ lessons: { title: string }[]; warnings: string[] }>('/admin/content/pdf/import', {
        mediaId: media!.id,
        moduleId,
        keepOriginal,
        splitByHeadings,
        ...(titleOverride ? { titleOverride } : {}),
      }),
    [`/admin/courses/${courseId}`, '/admin/courses'],
    {
      onSuccess: (data) => {
        setResult(data);
        setStep('done');
      },
      onError: (caught) => setError(caught.message),
    },
  );

  async function uploadPdf(file: File) {
    setError(null);

    if (file.type !== 'application/pdf') {
      setError('Choose a PDF file.');
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder', 'lesson-sources');

      const uploaded = await apiFetch<MediaDto>('/admin/media', {
        method: 'POST',
        body: formData,
      });
      setMedia(uploaded);
      previewMutation.mutate(uploaded.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Upload failed.');
    } finally {
      setIsUploading(false);
    }
  }

  const isBusy = isUploading || previewMutation.isPending;

  return (
    <Modal
      open
      onClose={onClose}
      title="Import a PDF"
      description="Convert a document into native lesson content, not an embedded viewer."
      size="xl"
      footer={
        step === 'preview' ? (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setError(null);
                importMutation.mutate(undefined as never);
              }}
              isLoading={importMutation.isPending}
            >
              Create {splitByHeadings && extraction ? extraction.outline.length : 1} draft lesson
              {splitByHeadings && extraction && extraction.outline.length !== 1 ? 's' : ''}
            </Button>
          </>
        ) : (
          <Button variant="ghost" onClick={onClose}>
            {step === 'done' ? 'Done' : 'Cancel'}
          </Button>
        )
      }
    >
      {error ? (
        <Alert tone="danger" className="mb-4">
          {error}
        </Alert>
      ) : null}

      {step === 'upload' ? (
        <div className="space-y-4">
          <label
            className={
              'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border px-6 py-14 text-center transition-colors hover:border-primary'
            }
          >
            {isBusy ? (
              <>
                <Loader2 className="size-8 animate-spin text-primary" aria-hidden="true" />
                <span className="text-sm text-text-secondary">
                  {isUploading ? 'Uploading…' : 'Reading the document…'}
                </span>
              </>
            ) : (
              <>
                <Upload className="size-8 text-text-muted" aria-hidden="true" />
                <span className="space-y-1">
                  <span className="block text-sm font-medium text-text-primary">
                    Choose a PDF to import
                  </span>
                  <span className="block text-xs text-text-muted">
                    Headings, paragraphs and lists are detected automatically.
                  </span>
                </span>
              </>
            )}
            <input
              type="file"
              accept="application/pdf"
              className="sr-only"
              disabled={isBusy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadPdf(file);
                event.target.value = '';
              }}
            />
          </label>

          <Alert tone="info">
            Extraction is a best-effort conversion. Scanned documents contain no selectable text and
            cannot be converted — offer those as a download instead.
          </Alert>
        </div>
      ) : null}

      {step === 'preview' && extraction ? (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface-sunken px-4 py-3">
            <FileText className="size-4 shrink-0 text-text-muted" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-sm text-text-secondary">
              {media?.originalName}
            </span>
            <span className="shrink-0 text-xs text-text-muted">
              {extraction.pageCount} pages · {extraction.document.content.length} blocks
            </span>
          </div>

          {extraction.warnings.length > 0 ? (
            <Alert tone="warning" title="Before you import">
              <ul className="mt-1 list-disc space-y-1 pl-4">
                {extraction.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </Alert>
          ) : null}

          <div className="space-y-4">
            <Input
              label="Lesson title"
              value={titleOverride}
              onChange={(event) => setTitleOverride(event.target.value)}
              disabled={splitByHeadings}
              hint={
                splitByHeadings
                  ? 'Each section takes its own heading as the lesson title.'
                  : undefined
              }
            />

            <div className="space-y-2.5 rounded-lg border border-border p-4">
              <Checkbox
                label="Keep the original PDF available as a download"
                checked={keepOriginal}
                onChange={(event) => setKeepOriginal(event.target.checked)}
              />
              <Checkbox
                label={`Split into one lesson per top-level heading (${extraction.outline.length} found)`}
                checked={splitByHeadings}
                disabled={extraction.outline.length === 0}
                onChange={(event) => setSplitByHeadings(event.target.checked)}
              />
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-text-primary">Preview</p>
            <div className="max-h-80 overflow-y-auto rounded-lg border border-border bg-surface p-5">
              <RichText document={extraction.document} className="text-base" />
            </div>
          </div>
        </div>
      ) : null}

      {step === 'done' && result ? (
        <div className="space-y-4">
          <Alert tone="success" title="Import complete">
            {result.lessons.length} draft {result.lessons.length === 1 ? 'lesson was' : 'lessons were'}{' '}
            created. Review the content, then publish when it reads correctly.
          </Alert>

          <ul className="divide-y divide-border rounded-lg border border-border">
            {result.lessons.map((lesson, index) => (
              <li key={index} className="flex items-center gap-2.5 px-4 py-2.5 text-sm">
                <FileText className="size-3.5 shrink-0 text-text-muted" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-text-secondary">{lesson.title}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Modal>
  );
}
