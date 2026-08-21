'use client';

import { useState } from 'react';
import { FileCheck2, History, Plus, ScrollText } from 'lucide-react';
import type { LegalDocumentDto, RichTextDocument } from '@academy/types';
import { PERMISSIONS } from '@academy/types';
import { api, useApiList, useApiMutation, useApiResource } from '@/lib/api/hooks';
import { formatDate } from '@/lib/utils';
import { useAuth } from '@/components/providers';
import { Alert, Badge, Button, Card, Checkbox, Input } from '@/components/ui';
import { AdminPageHeader, Modal } from './primitives';
import { RichTextEditor } from './rich-text-editor';

interface VersionRow {
  id: string;
  version: string;
  effectiveAt: string;
  isCurrent: boolean;
  createdAt: string;
  acceptanceCount: number;
}

/**
 * Legal documents.
 *
 * Versioned rather than editable in place: consent is only meaningful against a
 * specific text, so publishing a change creates a new version and leaves every
 * historical acceptance intact and auditable.
 */
export function LegalClient({ locale }: { locale: string }) {
  const { can } = useAuth();
  const canManage = can(PERMISSIONS.LEGAL_MANAGE);

  const [creating, setCreating] = useState(false);
  const [publishingFor, setPublishingFor] = useState<LegalDocumentDto | null>(null);
  const [historyFor, setHistoryFor] = useState<LegalDocumentDto | null>(null);

  const documentsQuery = useApiList<LegalDocumentDto>('/admin/legal');

  return (
    <>
      <AdminPageHeader
        title="Legal documents"
        description="Versioned policies. Publishing a new version preserves every past acceptance."
        action={
          canManage ? (
            <Button onClick={() => setCreating(true)}>
              <Plus className="size-4" aria-hidden="true" />
              New document
            </Button>
          ) : undefined
        }
      />

      {documentsQuery.error ? (
        <Alert tone="danger" className="mb-4">
          {documentsQuery.error.message}
        </Alert>
      ) : null}

      <div className="max-w-3xl space-y-4">
        {(documentsQuery.data?.items.length ?? 0) === 0 && !documentsQuery.isLoading ? (
          <Card>
            <div className="p-12 text-center">
              <ScrollText className="mx-auto size-8 text-text-muted" aria-hidden="true" />
              <p className="mt-3 text-text-secondary">No legal documents yet.</p>
            </div>
          </Card>
        ) : (
          documentsQuery.data?.items.map((document) => (
            <Card key={document.id}>
              <div className="space-y-3 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold text-text-primary">{document.title}</h2>
                      {document.requiresAcceptance ? (
                        <Badge tone="primary">
                          <FileCheck2 className="size-3" aria-hidden="true" />
                          Acceptance required
                        </Badge>
                      ) : null}
                    </div>
                    <p className="font-mono text-2xs text-text-muted">/legal/{document.slug}</p>

                    {document.currentVersion ? (
                      <p className="text-sm text-text-secondary">
                        Version {document.currentVersion.version} · effective{' '}
                        {formatDate(document.currentVersion.effectiveAt, locale)}
                      </p>
                    ) : (
                      <p className="text-sm text-warning">
                        No published version — this document is not visible on the site.
                      </p>
                    )}
                  </div>

                  {canManage ? (
                    <div className="flex shrink-0 gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setHistoryFor(document)}>
                        <History className="size-3.5" aria-hidden="true" />
                        History
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setPublishingFor(document)}>
                        Publish version
                      </Button>
                    </div>
                  ) : null}
                </div>
              </div>
            </Card>
          ))
        )}
      </div>

      {creating ? <CreateDocumentModal onClose={() => setCreating(false)} /> : null}

      {publishingFor ? (
        <PublishVersionModal document={publishingFor} onClose={() => setPublishingFor(null)} />
      ) : null}

      {historyFor ? (
        <VersionHistoryModal
          document={historyFor}
          locale={locale}
          onClose={() => setHistoryFor(null)}
        />
      ) : null}
    </>
  );
}

function CreateDocumentModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({ title: '', slug: '', requiresAcceptance: false });
  const [error, setError] = useState<string | null>(null);

  const mutation = useApiMutation(
    () => api.post('/admin/legal', form),
    ['/admin/legal', '/site/bootstrap'],
    { onSuccess: onClose, onError: (caught) => setError(caught.message) },
  );

  return (
    <Modal
      open
      onClose={onClose}
      title="New legal document"
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
            disabled={!form.title.trim() || !form.slug.trim()}
          >
            Create document
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error ? <Alert tone="danger">{error}</Alert> : null}

        <Input
          label="Title"
          required
          autoFocus
          value={form.title}
          onChange={(event) => setForm({ ...form, title: event.target.value })}
        />
        <Input
          label="URL slug"
          required
          hint="Lowercase with hyphens, e.g. refund-policy."
          value={form.slug}
          onChange={(event) => setForm({ ...form, slug: event.target.value })}
        />
        <Checkbox
          label="New accounts must accept this at registration"
          checked={form.requiresAcceptance}
          onChange={(event) => setForm({ ...form, requiresAcceptance: event.target.checked })}
        />
      </div>
    </Modal>
  );
}

function PublishVersionModal({
  document,
  onClose,
}: {
  document: LegalDocumentDto;
  onClose: () => void;
}) {
  // Pre-fill from the current version so a small amendment does not mean
  // retyping the whole policy.
  const [version, setVersion] = useState('');
  const [body, setBody] = useState<RichTextDocument>(
    document.currentVersion?.body ?? { type: 'doc', content: [] },
  );
  const [error, setError] = useState<string | null>(null);

  const mutation = useApiMutation(
    () => api.post(`/admin/legal/${document.id}/versions`, { version, body, publish: true }),
    ['/admin/legal', '/site/bootstrap'],
    { onSuccess: onClose, onError: (caught) => setError(caught.message) },
  );

  return (
    <Modal
      open
      onClose={onClose}
      title={`Publish a new version of ${document.title}`}
      description="The previous version stays on record, along with everyone who accepted it."
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
            disabled={!/^[0-9]+(\.[0-9]+)*$/.test(version)}
          >
            Publish version
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {error ? <Alert tone="danger">{error}</Alert> : null}

        <Input
          label="Version number"
          required
          autoFocus
          placeholder="2.0"
          hint={
            document.currentVersion
              ? `Current version is ${document.currentVersion.version}. Use a higher number.`
              : 'Start at 1.0.'
          }
          value={version}
          onChange={(event) => setVersion(event.target.value)}
        />

        {document.requiresAcceptance ? (
          <Alert tone="warning">
            This document requires acceptance, so publishing a new version will prompt existing
            users to accept it.
          </Alert>
        ) : null}

        <div>
          <p className="mb-2 text-sm font-medium text-text-primary">Document text</p>
          <RichTextEditor value={body} onChange={setBody} minBlocks={0} />
        </div>
      </div>
    </Modal>
  );
}

function VersionHistoryModal({
  document,
  locale,
  onClose,
}: {
  document: LegalDocumentDto;
  locale: string;
  onClose: () => void;
}) {
  const versionsQuery = useApiResource<VersionRow[]>(`/admin/legal/${document.id}/versions`);

  return (
    <Modal open onClose={onClose} title={`${document.title} — version history`} size="lg">
      {versionsQuery.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="skeleton h-14 rounded-lg" />
          ))}
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {versionsQuery.data?.map((version) => (
            <li key={version.id} className="flex items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-text-primary">Version {version.version}</p>
                  {version.isCurrent ? <Badge tone="success">Current</Badge> : null}
                </div>
                <p className="text-xs text-text-muted">
                  Effective {formatDate(version.effectiveAt, locale)}
                </p>
              </div>

              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold text-text-primary">{version.acceptanceCount}</p>
                <p className="text-2xs text-text-muted">acceptances</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
