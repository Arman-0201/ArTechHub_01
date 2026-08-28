'use client';

import { useState } from 'react';
import { GripVertical, Plus, Trash2 } from 'lucide-react';
import type {
  CollectionDto,
  CollectionEntryDto,
  CollectionFact,
  CollectionPanelDto,
  CollectionPanelKind,
} from '@academy/types';
import { api, useApiMutation } from '@/lib/api/hooks';
import { Alert, Badge, Button, Checkbox, Input, Select, Textarea } from '@/components/ui';
import { Modal } from './primitives';

/**
 * The entry editor.
 *
 * An entry is two things: the fields every entry in the collection shares —
 * which is what the card and the search read — and the panels its detail page
 * is built from. The panels are the interesting half, and the shape they take
 * is deliberately closed: five kinds, two columns. An editor arranges panels;
 * they do not lay out a page. That constraint is what keeps the hundredth entry
 * looking like the first, and it is the whole reason a collection exists rather
 * than a hundred CMS pages.
 *
 * Switching a panel's kind keeps whatever was typed into the other kinds. The
 * renderer reads only the field its kind names, so nothing is lost by trying a
 * shape and changing your mind.
 */

const PANEL_KIND_LABELS: Record<CollectionPanelKind, string> = {
  TEXT: 'Paragraphs',
  LIST: 'Checklist',
  FACTS: 'Key / value rows',
  TABLE: 'Table',
  LINKS: 'Link cards',
};

const TONE_OPTIONS = [
  { value: 'DEFAULT', label: 'Default' },
  { value: 'INFO', label: 'Info' },
  { value: 'SUCCESS', label: 'Success' },
  { value: 'WARNING', label: 'Warning' },
  { value: 'DANGER', label: 'Danger' },
];

function newPanelId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `panel-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function emptyPanel(): CollectionPanelDto {
  return {
    id: newPanelId(),
    kind: 'TEXT',
    column: 'MAIN',
    tone: 'DEFAULT',
    title: '',
    iconName: null,
    body: null,
    items: [],
    facts: [],
    table: null,
    links: [],
  };
}

export function CollectionEntryEditor({
  collection,
  entry,
  onClose,
}: {
  collection: CollectionDto;
  /** Null creates a new entry. */
  entry: CollectionEntryDto | null;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(entry?.title ?? '');
  const [slug, setSlug] = useState(entry?.slug ?? '');
  const [subtitle, setSubtitle] = useState(entry?.subtitle ?? '');
  const [summary, setSummary] = useState(entry?.summary ?? '');
  const [badge, setBadge] = useState(entry?.badge ?? '');
  const [tone, setTone] = useState(entry?.tone ?? 'DEFAULT');
  const [categoryId, setCategoryId] = useState(entry?.category?.id ?? '');
  const [keywords, setKeywords] = useState((entry?.keywords ?? []).join(', '));
  const [isFeatured, setIsFeatured] = useState(entry?.isFeatured ?? false);
  const [status, setStatus] = useState(entry?.status ?? 'DRAFT');
  const [facts, setFacts] = useState<CollectionFact[]>(entry?.facts ?? []);
  const [panels, setPanels] = useState<CollectionPanelDto[]>(entry?.panels ?? []);
  const [error, setError] = useState<string | null>(null);

  const invalidate = [`/admin/collections/${collection.id}/entries`, '/admin/collections'];

  const mutation = useApiMutation(
    () => {
      const body = {
        title,
        ...(slug ? { slug } : {}),
        subtitle: subtitle || null,
        summary: summary || null,
        badge: badge || null,
        tone,
        categoryId: categoryId || null,
        isFeatured,
        status,
        keywords: keywords
          .split(',')
          .map((word) => word.trim())
          .filter(Boolean),
        facts: facts.filter((fact) => fact.label.trim().length > 0),
        panels,
      };
      return entry
        ? api.patch(`/admin/collection-entries/${entry.id}`, body)
        : api.post(`/admin/collections/${collection.id}/entries`, body);
    },
    invalidate,
    { onSuccess: onClose, onError: (caught) => setError(caught.message) },
  );

  function patchPanel(id: string, patch: Partial<CollectionPanelDto>) {
    setPanels((current) =>
      current.map((panel) => (panel.id === id ? { ...panel, ...patch } : panel)),
    );
  }

  function movePanel(index: number, delta: number) {
    setPanels((current) => {
      const next = [...current];
      const target = index + delta;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  }

  const mainCount = panels.filter((panel) => panel.column === 'MAIN').length;
  const sideCount = panels.length - mainCount;

  return (
    <Modal
      open
      onClose={onClose}
      title={entry ? `Edit ${entry.title}` : `New entry in ${collection.name}`}
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
            disabled={title.trim().length === 0}
          >
            Save entry
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        {error ? <Alert tone="danger">{error}</Alert> : null}

        {/* ------------------------------------------------------- the card */}
        <section className="space-y-4">
          <h3 className="text-sm font-semibold text-text-primary">Card &amp; search</h3>
          <p className="-mt-3 text-xs text-text-muted">
            What appears in the grid, and what the index search matches on.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Title"
              required
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Port 22"
            />
            <Input
              label="Subtitle"
              value={subtitle}
              onChange={(event) => setSubtitle(event.target.value)}
              placeholder="SSH"
            />
          </div>

          <Input
            label="URL slug"
            hint={`/reference/${collection.slug}/${slug || 'auto'}. Leave blank to derive it from the title.`}
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
            placeholder="22"
          />

          <Textarea
            label="Summary"
            rows={2}
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            placeholder="Learn about port 22 (SSH) — security risks, common uses, and how to find devices with it open."
          />

          <div className="grid gap-4 sm:grid-cols-3">
            <Input
              label="Badge"
              hint="The small label on the card."
              value={badge}
              onChange={(event) => setBadge(event.target.value)}
              placeholder="TCP"
            />
            <Select
              label="Accent"
              hint="Danger draws the red treatment."
              value={tone}
              onChange={(event) => setTone(event.target.value as typeof tone)}
              options={TONE_OPTIONS}
            />
            <Select
              label="Filter group"
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              options={[
                { value: '', label: 'None' },
                ...collection.categories.map((category) => ({
                  value: category.id,
                  label: category.name,
                })),
              ]}
            />
          </div>

          <Input
            label="Search keywords"
            hint="Comma separated. Aliases and synonyms a visitor might type instead of the title."
            value={keywords}
            onChange={(event) => setKeywords(event.target.value)}
            placeholder="secure shell, sftp, scp"
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Status"
              value={status}
              onChange={(event) => setStatus(event.target.value as typeof status)}
              options={[
                { value: 'DRAFT', label: 'Draft — not reachable' },
                { value: 'PUBLISHED', label: 'Published' },
                { value: 'ARCHIVED', label: 'Archived' },
              ]}
            />
            <div className="flex items-end pb-2">
              <Checkbox
                label="Pin to the top of the grid"
                checked={isFeatured}
                onChange={(event) => setIsFeatured(event.target.checked)}
              />
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------ quick info */}
        <section className="space-y-3 border-t border-border pt-5">
          <h3 className="text-sm font-semibold text-text-primary">Quick info</h3>
          <p className="-mt-2 text-xs text-text-muted">
            Key/value rows, shown at the top of the sidebar on the detail page. Every entry gets
            this panel automatically — there is no need to add one.
          </p>

          <FactRows facts={facts} onChange={setFacts} />
        </section>

        {/* ---------------------------------------------------------- panels */}
        <section className="space-y-3 border-t border-border pt-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-text-primary">Panels</h3>
              <p className="text-xs text-text-muted">
                {panels.length === 0
                  ? 'The boxes the detail page is built from.'
                  : `${mainCount} in the main column, ${sideCount} in the sidebar.`}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPanels((current) => [...current, emptyPanel()])}
            >
              <Plus className="size-3.5" aria-hidden="true" />
              Add panel
            </Button>
          </div>

          {panels.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-text-muted">
              No panels yet. Add one for the description, another for the risks, and put the
              software list in the sidebar.
            </p>
          ) : (
            <div className="space-y-3">
              {panels.map((panel, index) => (
                <PanelFields
                  key={panel.id}
                  panel={panel}
                  index={index}
                  isFirst={index === 0}
                  isLast={index === panels.length - 1}
                  onChange={(patch) => patchPanel(panel.id, patch)}
                  onMove={(delta) => movePanel(index, delta)}
                  onRemove={() =>
                    setPanels((current) => current.filter((entry) => entry.id !== panel.id))
                  }
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------- panel */

function PanelFields({
  panel,
  index,
  isFirst,
  isLast,
  onChange,
  onMove,
  onRemove,
}: {
  panel: CollectionPanelDto;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  onChange: (patch: Partial<CollectionPanelDto>) => void;
  onMove: (delta: number) => void;
  onRemove: () => void;
}) {
  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-text-muted">
          <GripVertical className="size-3.5" aria-hidden="true" />
          Panel {index + 1}
          <Badge tone={panel.column === 'SIDE' ? 'accent' : 'neutral'}>
            {panel.column === 'SIDE' ? 'sidebar' : 'main'}
          </Badge>
        </span>

        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            disabled={isFirst}
            onClick={() => onMove(-1)}
            aria-label={`Move panel ${index + 1} up`}
          >
            ↑
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={isLast}
            onClick={() => onMove(1)}
            aria-label={`Move panel ${index + 1} down`}
          >
            ↓
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onRemove}
            aria-label={`Remove panel ${index + 1}`}
          >
            <Trash2 className="size-3.5 text-danger" aria-hidden="true" />
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          label="Title"
          value={panel.title}
          onChange={(event) => onChange({ title: event.target.value })}
          placeholder="Service description"
        />
        <Input
          label="Lucide icon name"
          value={panel.iconName ?? ''}
          onChange={(event) => onChange({ iconName: event.target.value || null })}
          placeholder="ShieldAlert"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Select
          label="Content"
          value={panel.kind}
          onChange={(event) => onChange({ kind: event.target.value as CollectionPanelKind })}
          options={Object.entries(PANEL_KIND_LABELS).map(([value, label]) => ({ value, label }))}
        />
        <Select
          label="Column"
          value={panel.column}
          onChange={(event) => onChange({ column: event.target.value as 'MAIN' | 'SIDE' })}
          options={[
            { value: 'MAIN', label: 'Main column' },
            { value: 'SIDE', label: 'Sidebar' },
          ]}
        />
        <Select
          label="Accent"
          value={panel.tone}
          onChange={(event) => onChange({ tone: event.target.value as CollectionPanelDto['tone'] })}
          options={TONE_OPTIONS}
        />
      </div>

      <PanelBodyFields panel={panel} onChange={onChange} />
    </div>
  );
}

function PanelBodyFields({
  panel,
  onChange,
}: {
  panel: CollectionPanelDto;
  onChange: (patch: Partial<CollectionPanelDto>) => void;
}) {
  switch (panel.kind) {
    case 'TEXT':
      return (
        <Textarea
          label="Text"
          hint="Leave a blank line between paragraphs."
          rows={5}
          value={panel.body ?? ''}
          onChange={(event) => onChange({ body: event.target.value || null })}
        />
      );

    case 'LIST':
      return (
        <Textarea
          label="Items"
          hint="One per line."
          rows={5}
          value={panel.items.join('\n')}
          onChange={(event) =>
            onChange({
              items: event.target.value
                .split('\n')
                .map((line) => line.trim())
                .filter(Boolean),
            })
          }
          placeholder={'OpenSSH\nPuTTY\nBitvise SSH Client'}
        />
      );

    case 'FACTS':
      return <FactRows facts={panel.facts} onChange={(facts) => onChange({ facts })} />;

    case 'TABLE':
      return (
        <div className="space-y-3">
          <Input
            label="Columns"
            hint="Comma separated."
            value={(panel.table?.columns ?? []).join(', ')}
            onChange={(event) =>
              onChange({
                table: {
                  columns: event.target.value
                    .split(',')
                    .map((column) => column.trim())
                    .filter(Boolean),
                  rows: panel.table?.rows ?? [],
                },
              })
            }
            placeholder="CVE, Name, Severity, Description"
          />
          <Textarea
            label="Rows"
            hint="One row per line, cells separated by a vertical bar (|)."
            rows={6}
            className="font-mono text-xs"
            value={(panel.table?.rows ?? []).map((row) => row.join(' | ')).join('\n')}
            onChange={(event) =>
              onChange({
                table: {
                  columns: panel.table?.columns ?? [],
                  rows: event.target.value
                    .split('\n')
                    .filter((line) => line.trim().length > 0)
                    .map((line) => line.split('|').map((cell) => cell.trim())),
                },
              })
            }
            placeholder="CVE-2024-6387 | OpenSSH RCE | Medium | Signal handler race condition"
          />
        </div>
      );

    case 'LINKS':
      return (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-text-primary">Links</legend>

          {panel.links.map((link, index) => (
            <div key={index} className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-2">
              <Input
                label="Label"
                value={link.label}
                onChange={(event) =>
                  onChange({
                    links: panel.links.map((entry, i) =>
                      i === index ? { ...entry, label: event.target.value } : entry,
                    ),
                  })
                }
                placeholder="Port 3389"
              />
              <Input
                label="Sublabel"
                value={link.sublabel ?? ''}
                onChange={(event) =>
                  onChange({
                    links: panel.links.map((entry, i) =>
                      i === index ? { ...entry, sublabel: event.target.value || null } : entry,
                    ),
                  })
                }
                placeholder="RDP"
              />
              <Input
                label="Link"
                hint="A site path such as /en/reference/ports/3389, or a full URL."
                value={link.href}
                onChange={(event) =>
                  onChange({
                    links: panel.links.map((entry, i) =>
                      i === index ? { ...entry, href: event.target.value } : entry,
                    ),
                  })
                }
                placeholder="/en/reference/ports/3389"
              />
              <div className="flex items-end gap-2">
                <Input
                  label="Badge"
                  className="flex-1"
                  value={link.badge ?? ''}
                  onChange={(event) =>
                    onChange({
                      links: panel.links.map((entry, i) =>
                        i === index ? { ...entry, badge: event.target.value || null } : entry,
                      ),
                    })
                  }
                  placeholder="TCP"
                />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    onChange({ links: panel.links.filter((_, i) => i !== index) })
                  }
                  aria-label={`Remove link ${index + 1}`}
                >
                  <Trash2 className="size-3.5 text-danger" aria-hidden="true" />
                </Button>
              </div>
            </div>
          ))}

          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              onChange({
                links: [
                  ...panel.links,
                  { label: '', sublabel: null, href: '/', badge: null, tone: 'DEFAULT' },
                ],
              })
            }
          >
            <Plus className="size-3.5" aria-hidden="true" />
            Add link
          </Button>
        </fieldset>
      );

    default:
      return null;
  }
}

/** Key/value rows, shared by the entry's quick info and any `FACTS` panel. */
function FactRows({
  facts,
  onChange,
}: {
  facts: CollectionFact[];
  onChange: (facts: CollectionFact[]) => void;
}) {
  return (
    <div className="space-y-2">
      {facts.map((fact, index) => (
        <div key={index} className="flex items-end gap-2">
          <Input
            label={index === 0 ? 'Label' : undefined}
            aria-label={`Label ${index + 1}`}
            className="flex-1"
            value={fact.label}
            onChange={(event) =>
              onChange(
                facts.map((entry, i) =>
                  i === index ? { ...entry, label: event.target.value } : entry,
                ),
              )
            }
            placeholder="Protocol"
          />
          <Input
            label={index === 0 ? 'Value' : undefined}
            aria-label={`Value ${index + 1}`}
            className="flex-1"
            value={fact.value}
            onChange={(event) =>
              onChange(
                facts.map((entry, i) =>
                  i === index ? { ...entry, value: event.target.value } : entry,
                ),
              )
            }
            placeholder="TCP"
          />
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onChange(facts.filter((_, i) => i !== index))}
            aria-label={`Remove row ${index + 1}`}
          >
            <Trash2 className="size-3.5 text-danger" aria-hidden="true" />
          </Button>
        </div>
      ))}

      <Button
        size="sm"
        variant="outline"
        onClick={() => onChange([...facts, { label: '', value: '' }])}
      >
        <Plus className="size-3.5" aria-hidden="true" />
        Add row
      </Button>
    </div>
  );
}
