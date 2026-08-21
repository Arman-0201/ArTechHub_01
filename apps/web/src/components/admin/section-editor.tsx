'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { PageSectionDto, RichTextDocument } from '@academy/types';
import { api, useApiMutation } from '@/lib/api/hooks';
import { Alert, Button, Checkbox, Input, Select, Textarea } from '@/components/ui';
import { Modal } from './primitives';
import { RichTextEditor } from './rich-text-editor';
import { MediaPickerButton } from './media-picker';

/**
 * Section content editor.
 *
 * Each section type gets a purpose-built form rather than a raw JSON textarea:
 * the shape of `content` is an implementation detail the editor should never
 * have to know. Types without a bespoke form fall back to the shared
 * heading/description fields, which covers the majority.
 */
export function SectionEditor({
  pageId,
  section,
  onClose,
}: {
  pageId: string;
  section: PageSectionDto;
  onClose: () => void;
}) {
  const [content, setContent] = useState<Record<string, unknown>>(section.content);
  const [settings, setSettings] = useState<Record<string, unknown>>(section.settings);
  const [isVisible, setIsVisible] = useState(section.isVisible);
  const [error, setError] = useState<string | null>(null);

  const mutation = useApiMutation(
    () => api.patch(`/admin/sections/${section.id}`, { content, settings, isVisible }),
    [`/admin/pages/${pageId}`, '/admin/pages'],
    { onSuccess: onClose, onError: (caught) => setError(caught.message) },
  );

  const set = (patch: Record<string, unknown>) => setContent({ ...content, ...patch });
  const setSetting = (patch: Record<string, unknown>) => setSettings({ ...settings, ...patch });

  const text = (key: string) => (typeof content[key] === 'string' ? (content[key] as string) : '');
  const setting = (key: string, fallback: string) =>
    typeof settings[key] === 'string' ? (settings[key] as string) : fallback;

  return (
    <Modal
      open
      onClose={onClose}
      title={`Edit ${section.type.replace(/_/g, ' ').toLowerCase()} section`}
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
          >
            Save section
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {error ? <Alert tone="danger">{error}</Alert> : null}

        {/* Every section shares background, visibility and (usually) a heading. */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Background"
            value={setting('background', 'default')}
            onChange={(event) => setSetting({ background: event.target.value })}
            options={[
              { value: 'default', label: 'Default' },
              { value: 'subtle', label: 'Subtle tint' },
              { value: 'surface', label: 'Surface' },
              { value: 'gradient', label: 'Gradient' },
            ]}
          />
          <Select
            label="Alignment"
            value={setting('align', 'left')}
            onChange={(event) => setSetting({ align: event.target.value })}
            options={[
              { value: 'left', label: 'Left' },
              { value: 'center', label: 'Centred' },
            ]}
          />
        </div>

        <SectionFields
          type={section.type}
          content={content}
          settings={settings}
          set={set}
          setSetting={setSetting}
          text={text}
        />

        <Checkbox
          label="Visible on the page"
          checked={isVisible}
          onChange={(event) => setIsVisible(event.target.checked)}
        />
      </div>
    </Modal>
  );
}

interface FieldProps {
  type: string;
  content: Record<string, unknown>;
  settings: Record<string, unknown>;
  set: (patch: Record<string, unknown>) => void;
  setSetting: (patch: Record<string, unknown>) => void;
  text: (key: string) => string;
}

function SectionFields({ type, content, set, setSetting, settings, text }: FieldProps) {
  const numberSetting = (key: string, fallback: number) =>
    typeof settings[key] === 'number' ? (settings[key] as number) : fallback;

  switch (type) {
    case 'HERO':
      return (
        <>
          <Input
            label="Eyebrow"
            hint="Small label above the headline. Optional."
            value={text('eyebrow')}
            onChange={(event) => set({ eyebrow: event.target.value })}
          />
          <Input
            label="Headline"
            required
            value={text('title')}
            onChange={(event) => set({ title: event.target.value })}
          />
          <Textarea
            label="Description"
            rows={3}
            value={text('description')}
            onChange={(event) => set({ description: event.target.value })}
          />
          <ActionFields content={content} set={set} />
          <ListField
            label="Highlights"
            hint="Short phrases shown under the buttons. One per line."
            value={Array.isArray(content.highlights) ? (content.highlights as string[]) : []}
            onChange={(highlights) => set({ highlights })}
          />
        </>
      );

    case 'TEXT':
      return (
        <>
          <Input
            label="Heading"
            value={text('title')}
            onChange={(event) => set({ title: event.target.value })}
          />
          <Textarea
            label="Body"
            rows={4}
            value={text('description')}
            onChange={(event) => set({ description: event.target.value })}
          />
        </>
      );

    case 'RICH_TEXT':
      return (
        <div>
          <p className="mb-2 text-sm font-medium text-text-primary">Content</p>
          <RichTextEditor
            value={(content.body as RichTextDocument | undefined) ?? { type: 'doc', content: [] }}
            onChange={(document) => set({ body: document })}
            minBlocks={0}
          />
        </div>
      );

    case 'HTML':
      return (
        <>
          <Alert tone="warning">
            HTML is sanitised on the server: scripts, iframes, event handlers and unsafe URLs are
            stripped before it is stored.
          </Alert>
          <Textarea
            label="HTML"
            rows={10}
            className="font-mono text-xs"
            value={text('html')}
            onChange={(event) => set({ html: event.target.value })}
          />
        </>
      );

    case 'IMAGE':
    case 'IMAGE_TEXT':
      return (
        <>
          <div className="flex items-end gap-2">
            <Input
              label="Image URL"
              value={text('src')}
              onChange={(event) => set({ src: event.target.value })}
              containerClassName="flex-1"
            />
            <MediaPickerButton kind="IMAGE" onSelect={(media) => set({ src: media.url })} />
          </div>
          <Input
            label="Alt text"
            hint="Describes the image for screen readers."
            value={text('alt')}
            onChange={(event) => set({ alt: event.target.value })}
          />
          {type === 'IMAGE' ? (
            <Input
              label="Caption"
              value={text('caption')}
              onChange={(event) => set({ caption: event.target.value })}
            />
          ) : (
            <>
              <Input
                label="Heading"
                value={text('title')}
                onChange={(event) => set({ title: event.target.value })}
              />
              <Textarea
                label="Description"
                rows={3}
                value={text('description')}
                onChange={(event) => set({ description: event.target.value })}
              />
              <Select
                label="Image position"
                value={typeof settings.imagePosition === 'string' ? settings.imagePosition : 'left'}
                onChange={(event) => setSetting({ imagePosition: event.target.value })}
                options={[
                  { value: 'left', label: 'Image on the left' },
                  { value: 'right', label: 'Image on the right' },
                ]}
              />
              <ActionFields content={content} set={set} single />
            </>
          )}
        </>
      );

    case 'FEATURE_GRID':
      return (
        <>
          <Input
            label="Heading"
            value={text('title')}
            onChange={(event) => set({ title: event.target.value })}
          />
          <Textarea
            label="Description"
            rows={2}
            value={text('description')}
            onChange={(event) => set({ description: event.target.value })}
          />
          <RepeaterField
            label="Features"
            items={
              Array.isArray(content.items)
                ? (content.items as { icon?: string; title: string; description: string }[])
                : []
            }
            onChange={(items) => set({ items })}
            emptyItem={{ icon: 'Sparkles', title: '', description: '' }}
            fields={[
              { key: 'icon', label: 'Lucide icon name', placeholder: 'ShieldCheck' },
              { key: 'title', label: 'Title' },
              { key: 'description', label: 'Description', multiline: true },
            ]}
          />
        </>
      );

    case 'STATS':
      return (
        <>
          <Input
            label="Heading"
            value={text('title')}
            onChange={(event) => set({ title: event.target.value })}
          />
          <RepeaterField
            label="Statistics"
            items={
              Array.isArray(content.items) ? (content.items as { value: string; label: string }[]) : []
            }
            onChange={(items) => set({ items })}
            emptyItem={{ value: '', label: '' }}
            fields={[
              { key: 'value', label: 'Value', placeholder: '12,000' },
              { key: 'label', label: 'Label', placeholder: 'Learners' },
            ]}
          />
        </>
      );

    case 'TESTIMONIALS':
      return (
        <>
          <Input
            label="Heading"
            value={text('title')}
            onChange={(event) => set({ title: event.target.value })}
          />
          <RepeaterField
            label="Testimonials"
            items={
              Array.isArray(content.items)
                ? (content.items as { quote: string; author: string; role?: string }[])
                : []
            }
            onChange={(items) => set({ items })}
            emptyItem={{ quote: '', author: '', role: '' }}
            fields={[
              { key: 'quote', label: 'Quote', multiline: true },
              { key: 'author', label: 'Author' },
              { key: 'role', label: 'Role' },
            ]}
          />
        </>
      );

    case 'FAQ':
      return (
        <>
          <Input
            label="Heading"
            value={text('title')}
            onChange={(event) => set({ title: event.target.value })}
          />
          <RepeaterField
            label="Questions"
            items={
              Array.isArray(content.items)
                ? (content.items as { question: string; answer: string }[])
                : []
            }
            onChange={(items) => set({ items })}
            emptyItem={{ question: '', answer: '' }}
            fields={[
              { key: 'question', label: 'Question' },
              { key: 'answer', label: 'Answer', multiline: true },
            ]}
          />
        </>
      );

    case 'CTA':
      return (
        <>
          <Input
            label="Headline"
            required
            value={text('title')}
            onChange={(event) => set({ title: event.target.value })}
          />
          <Textarea
            label="Description"
            rows={2}
            value={text('description')}
            onChange={(event) => set({ description: event.target.value })}
          />
          <ActionFields content={content} set={set} />
        </>
      );

    case 'COURSE_GRID':
    case 'CATEGORY_GRID':
    case 'BLOG_GRID':
    case 'INSTRUCTOR_LIST':
      return (
        <>
          <Input
            label="Heading"
            value={text('title')}
            onChange={(event) => set({ title: event.target.value })}
          />
          <Textarea
            label="Description"
            rows={2}
            value={text('description')}
            onChange={(event) => set({ description: event.target.value })}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Maximum items"
              type="number"
              min={1}
              max={24}
              value={numberSetting('limit', 6)}
              onChange={(event) => setSetting({ limit: Number(event.target.value) || 6 })}
            />
            <Select
              label="Columns"
              value={String(numberSetting('columns', 3))}
              onChange={(event) => setSetting({ columns: Number(event.target.value) })}
              options={[
                { value: '2', label: '2 columns' },
                { value: '3', label: '3 columns' },
                { value: '4', label: '4 columns' },
              ]}
            />
          </div>
          <ActionFields content={content} set={set} single actionKey="action" />
        </>
      );

    case 'VIDEO':
      return (
        <>
          <Input
            label="Heading"
            value={text('title')}
            onChange={(event) => set({ title: event.target.value })}
          />
          <div className="flex items-end gap-2">
            <Input
              label="Video URL"
              hint="An uploaded file, or a YouTube/Vimeo embed URL."
              value={text('src')}
              onChange={(event) => set({ src: event.target.value })}
              containerClassName="flex-1"
            />
            <MediaPickerButton kind="VIDEO" onSelect={(media) => set({ src: media.url })} />
          </div>
        </>
      );

    case 'NEWSLETTER':
      return (
        <>
          <Input
            label="Heading"
            value={text('title')}
            onChange={(event) => set({ title: event.target.value })}
          />
          <Textarea
            label="Description"
            rows={2}
            value={text('description')}
            onChange={(event) => set({ description: event.target.value })}
          />
          <Input
            label="Button label"
            value={text('buttonLabel')}
            onChange={(event) => set({ buttonLabel: event.target.value })}
          />
        </>
      );

    case 'TEAM':
      return (
        <>
          <Input
            label="Heading"
            value={text('title')}
            onChange={(event) => set({ title: event.target.value })}
          />
          <RepeaterField
            label="Team members"
            items={
              Array.isArray(content.items)
                ? (content.items as { name: string; role?: string; bio?: string }[])
                : []
            }
            onChange={(items) => set({ items })}
            emptyItem={{ name: '', role: '', bio: '' }}
            fields={[
              { key: 'name', label: 'Name' },
              { key: 'role', label: 'Role' },
              { key: 'bio', label: 'Short bio', multiline: true },
            ]}
          />
        </>
      );

    case 'CAROUSEL':
    case 'LOGO_CAROUSEL':
      return (
        <>
          <Input
            label="Heading"
            value={text('title')}
            onChange={(event) => set({ title: event.target.value })}
          />
          <RepeaterField
            label="Logos"
            items={Array.isArray(content.items) ? (content.items as { src: string; alt?: string }[]) : []}
            onChange={(items) => set({ items })}
            emptyItem={{ src: '', alt: '' }}
            fields={[
              { key: 'src', label: 'Image URL' },
              { key: 'alt', label: 'Alt text' },
            ]}
          />
        </>
      );

    default:
      return (
        <>
          <Input
            label="Heading"
            value={text('title')}
            onChange={(event) => set({ title: event.target.value })}
          />
          <Textarea
            label="Description"
            rows={3}
            value={text('description')}
            onChange={(event) => set({ description: event.target.value })}
          />
        </>
      );
  }
}

function ActionFields({
  content,
  set,
  single,
  actionKey = 'primaryAction',
}: {
  content: Record<string, unknown>;
  set: (patch: Record<string, unknown>) => void;
  single?: boolean;
  actionKey?: string;
}) {
  const read = (key: string) => {
    const value = content[key];
    if (!value || typeof value !== 'object') return { label: '', href: '' };
    const action = value as { label?: string; href?: string };
    return { label: action.label ?? '', href: action.href ?? '' };
  };

  const primary = read(actionKey);
  const secondary = read('secondaryAction');

  const write = (key: string, patch: { label?: string; href?: string }) => {
    const current = read(key);
    const next = { ...current, ...patch };
    // An action with no label or no target is not a button — drop it entirely
    // rather than rendering a link to nowhere.
    set({ [key]: next.label && next.href ? next : null });
  };

  return (
    <div className="space-y-4 rounded-lg border border-border p-4">
      <p className="text-sm font-medium text-text-primary">
        {single ? 'Link' : 'Primary button'}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          label="Label"
          value={primary.label}
          onChange={(event) => write(actionKey, { label: event.target.value })}
        />
        <Input
          label="Target"
          placeholder="/courses"
          hint="A site path or an https:// URL."
          value={primary.href}
          onChange={(event) => write(actionKey, { href: event.target.value })}
        />
      </div>

      {!single ? (
        <>
          <p className="text-sm font-medium text-text-primary">Secondary button</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Label"
              value={secondary.label}
              onChange={(event) => write('secondaryAction', { label: event.target.value })}
            />
            <Input
              label="Target"
              placeholder="/about"
              value={secondary.href}
              onChange={(event) => write('secondaryAction', { href: event.target.value })}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}

function ListField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string[];
  onChange: (value: string[]) => void;
}) {
  return (
    <Textarea
      label={label}
      hint={hint}
      rows={3}
      value={value.join('\n')}
      onChange={(event) =>
        onChange(
          event.target.value
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean),
        )
      }
    />
  );
}

/** Generic repeating group — the shape most section types need. */
function RepeaterField<T extends Record<string, unknown>>({
  label,
  items,
  onChange,
  emptyItem,
  fields,
}: {
  label: string;
  items: T[];
  onChange: (items: T[]) => void;
  emptyItem: T;
  fields: { key: keyof T & string; label: string; placeholder?: string; multiline?: boolean }[];
}) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium text-text-primary">{label}</legend>

      {items.map((item, index) => (
        <div key={index} className="space-y-3 rounded-lg border border-border p-4">
          <div className="flex items-center justify-between">
            <span className="text-2xs font-semibold uppercase tracking-wider text-text-muted">
              Item {index + 1}
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onChange(items.filter((_, i) => i !== index))}
              aria-label={`Remove item ${index + 1}`}
            >
              <Trash2 className="size-3.5 text-danger" aria-hidden="true" />
            </Button>
          </div>

          {fields.map((field) =>
            field.multiline ? (
              <Textarea
                key={field.key}
                label={field.label}
                rows={2}
                placeholder={field.placeholder}
                value={String(item[field.key] ?? '')}
                onChange={(event) =>
                  onChange(
                    items.map((entry, i) =>
                      i === index ? { ...entry, [field.key]: event.target.value } : entry,
                    ),
                  )
                }
              />
            ) : (
              <Input
                key={field.key}
                label={field.label}
                placeholder={field.placeholder}
                value={String(item[field.key] ?? '')}
                onChange={(event) =>
                  onChange(
                    items.map((entry, i) =>
                      i === index ? { ...entry, [field.key]: event.target.value } : entry,
                    ),
                  )
                }
              />
            ),
          )}
        </div>
      ))}

      <Button size="sm" variant="outline" onClick={() => onChange([...items, { ...emptyItem }])}>
        <Plus className="size-3.5" aria-hidden="true" />
        Add item
      </Button>
    </fieldset>
  );
}
