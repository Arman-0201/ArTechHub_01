'use client';

import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { api, useApiMutation, useApiResource } from '@/lib/api/hooks';
import { Alert, Button, Card, Input } from '@/components/ui';
import { ConfirmDialog, Modal } from './primitives';

interface FooterLinkRow {
  id: string;
  label: string;
  url: string;
  target: string;
  sortOrder: number;
  isVisible: boolean;
}

interface FooterGroupRow {
  id: string;
  title: string;
  sortOrder: number;
  isVisible: boolean;
  links: FooterLinkRow[];
}

/**
 * Footer link columns.
 *
 * Separate from the menu tree because the footer is a set of titled columns
 * rather than a nested navigation — modelling it as a menu would force an
 * artificial hierarchy on it.
 */
export function FooterEditor({ canManage }: { canManage: boolean }) {
  const groupsQuery = useApiResource<FooterGroupRow[]>('/admin/footer');
  const groups = groupsQuery.data ?? [];

  const [editingGroup, setEditingGroup] = useState<FooterGroupRow | null>(null);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [linkContext, setLinkContext] = useState<{
    groupId: string;
    link?: FooterLinkRow;
  } | null>(null);
  const [deletingGroup, setDeletingGroup] = useState<FooterGroupRow | null>(null);
  const [deletingLink, setDeletingLink] = useState<FooterLinkRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  const invalidate = ['/admin/footer', '/site/bootstrap'];

  const deleteGroupMutation = useApiMutation(
    (group: FooterGroupRow) => api.delete(`/admin/footer/groups/${group.id}`),
    invalidate,
    { onSuccess: () => setDeletingGroup(null), onError: (caught) => setError(caught.message) },
  );

  const deleteLinkMutation = useApiMutation(
    (link: FooterLinkRow) => api.delete(`/admin/footer/links/${link.id}`),
    invalidate,
    { onSuccess: () => setDeletingLink(null), onError: (caught) => setError(caught.message) },
  );

  return (
    <section className="space-y-4 border-t border-border pt-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-text-primary">Footer columns</h2>
          <p className="text-sm text-text-muted">Titled groups of links shown in the site footer.</p>
        </div>
        {canManage ? (
          <Button size="sm" variant="outline" onClick={() => setCreatingGroup(true)}>
            <Plus className="size-3.5" aria-hidden="true" />
            Add column
          </Button>
        ) : null}
      </div>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {groups.map((group) => (
          <Card key={group.id}>
            <div className="p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="truncate text-sm font-semibold text-text-primary">{group.title}</h3>
                {canManage ? (
                  <div className="flex shrink-0 gap-0.5">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditingGroup(group)}
                      aria-label={`Rename ${group.title}`}
                    >
                      <Pencil className="size-3.5" aria-hidden="true" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDeletingGroup(group)}
                      aria-label={`Delete ${group.title}`}
                    >
                      <Trash2 className="size-3.5 text-danger" aria-hidden="true" />
                    </Button>
                  </div>
                ) : null}
              </div>

              <ul className="mt-3 space-y-1">
                {group.links.map((link) => (
                  <li key={link.id} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-text-secondary">
                        {link.label}
                      </span>
                      <span className="block truncate font-mono text-2xs text-text-muted">
                        {link.url}
                      </span>
                    </span>
                    {canManage ? (
                      <span className="flex shrink-0 gap-0.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setLinkContext({ groupId: group.id, link })}
                          aria-label={`Edit ${link.label}`}
                        >
                          <Pencil className="size-3" aria-hidden="true" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setDeletingLink(link)}
                          aria-label={`Delete ${link.label}`}
                        >
                          <Trash2 className="size-3 text-danger" aria-hidden="true" />
                        </Button>
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>

              {canManage ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="mt-2"
                  onClick={() => setLinkContext({ groupId: group.id })}
                >
                  <Plus className="size-3.5" aria-hidden="true" />
                  Add link
                </Button>
              ) : null}
            </div>
          </Card>
        ))}
      </div>

      {creatingGroup || editingGroup ? (
        <GroupModal
          group={editingGroup ?? undefined}
          onClose={() => {
            setCreatingGroup(false);
            setEditingGroup(null);
          }}
        />
      ) : null}

      {linkContext ? (
        <LinkModal
          groupId={linkContext.groupId}
          link={linkContext.link}
          onClose={() => setLinkContext(null)}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(deletingGroup)}
        onClose={() => setDeletingGroup(null)}
        onConfirm={() => deletingGroup && deleteGroupMutation.mutate(deletingGroup)}
        title={`Delete ${deletingGroup?.title ?? 'column'}`}
        message="The column and every link in it are removed from the footer."
        isLoading={deleteGroupMutation.isPending}
      />

      <ConfirmDialog
        open={Boolean(deletingLink)}
        onClose={() => setDeletingLink(null)}
        onConfirm={() => deletingLink && deleteLinkMutation.mutate(deletingLink)}
        title={`Delete ${deletingLink?.label ?? 'link'}`}
        message="This link is removed from the footer."
        isLoading={deleteLinkMutation.isPending}
      />
    </section>
  );
}

function GroupModal({ group, onClose }: { group?: FooterGroupRow; onClose: () => void }) {
  const [title, setTitle] = useState(group?.title ?? '');
  const [error, setError] = useState<string | null>(null);

  const mutation = useApiMutation(
    () =>
      group
        ? api.patch(`/admin/footer/groups/${group.id}`, { title })
        : api.post('/admin/footer/groups', { title }),
    ['/admin/footer', '/site/bootstrap'],
    { onSuccess: onClose, onError: (caught) => setError(caught.message) },
  );

  return (
    <Modal
      open
      onClose={onClose}
      title={group ? 'Rename column' : 'New footer column'}
      size="sm"
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
            disabled={!title.trim()}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <Input
          label="Column title"
          required
          autoFocus
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>
    </Modal>
  );
}

function LinkModal({
  groupId,
  link,
  onClose,
}: {
  groupId: string;
  link?: FooterLinkRow;
  onClose: () => void;
}) {
  const [form, setForm] = useState({ label: link?.label ?? '', url: link?.url ?? '/' });
  const [error, setError] = useState<string | null>(null);

  const mutation = useApiMutation(
    () =>
      link
        ? api.patch(`/admin/footer/links/${link.id}`, form)
        : api.post(`/admin/footer/groups/${groupId}/links`, form),
    ['/admin/footer', '/site/bootstrap'],
    { onSuccess: onClose, onError: (caught) => setError(caught.message) },
  );

  return (
    <Modal
      open
      onClose={onClose}
      title={link ? 'Edit link' : 'New footer link'}
      size="sm"
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
            disabled={!form.label.trim() || !form.url.trim()}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <Input
          label="Label"
          required
          autoFocus
          value={form.label}
          onChange={(event) => setForm({ ...form, label: event.target.value })}
        />
        <Input
          label="Target"
          required
          hint="A site path, or a full https:// URL."
          value={form.url}
          onChange={(event) => setForm({ ...form, url: event.target.value })}
        />
      </div>
    </Modal>
  );
}
