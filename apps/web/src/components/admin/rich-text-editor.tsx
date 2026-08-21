'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Code2,
  Heading2,
  Heading3,
  Image as ImageIcon,
  Info,
  List,
  ListOrdered,
  Minus,
  Plus,
  Quote,
  Table as TableIcon,
  Trash2,
  Type,
  Video,
} from 'lucide-react';
import type { RichTextDocument, RichTextNode } from '@academy/types';
import { cn } from '@/lib/utils';
import { Button, Input, Select } from '@/components/ui';
import { MediaPickerButton } from './media-picker';

/**
 * Block-based content editor.
 *
 * Deliberately not a contenteditable WYSIWYG. Lessons are stored as a
 * structured document, and editing that structure directly means:
 *   - what is saved is exactly what was edited, with no HTML normalisation
 *     step that can silently mangle content;
 *   - the output cannot contain markup at all, so there is no XSS surface to
 *     sanitise on the way in;
 *   - the PDF importer produces the same shape, so imported content is
 *     editable with the same tool.
 *
 * The trade-off is that inline formatting is limited to whole blocks. For
 * technical course material — headings, prose, lists, code, callouts, tables —
 * that has proven to be the right shape.
 */

type BlockType =
  | 'paragraph'
  | 'heading2'
  | 'heading3'
  | 'bulletList'
  | 'orderedList'
  | 'codeBlock'
  | 'blockquote'
  | 'callout'
  | 'image'
  | 'video'
  | 'divider'
  | 'table';

interface BlockDefinition {
  type: BlockType;
  label: string;
  Icon: typeof Type;
}

const BLOCK_TYPES: BlockDefinition[] = [
  { type: 'paragraph', label: 'Paragraph', Icon: Type },
  { type: 'heading2', label: 'Heading', Icon: Heading2 },
  { type: 'heading3', label: 'Subheading', Icon: Heading3 },
  { type: 'bulletList', label: 'Bulleted list', Icon: List },
  { type: 'orderedList', label: 'Numbered list', Icon: ListOrdered },
  { type: 'codeBlock', label: 'Code', Icon: Code2 },
  { type: 'blockquote', label: 'Quote', Icon: Quote },
  { type: 'callout', label: 'Callout', Icon: Info },
  { type: 'image', label: 'Image', Icon: ImageIcon },
  { type: 'video', label: 'Video', Icon: Video },
  { type: 'table', label: 'Table', Icon: TableIcon },
  { type: 'divider', label: 'Divider', Icon: Minus },
];

/** Reads the plain text out of a node's inline children. */
function nodeText(node: RichTextNode): string {
  const content = (node as { content?: RichTextNode[] }).content ?? [];
  return content
    .map((child) => ('text' in child ? (child as { text: string }).text : ''))
    .join('');
}

/** Reads a list node back into one item per line. */
function listText(node: RichTextNode): string {
  const items = (node as { content?: RichTextNode[] }).content ?? [];
  return items
    .map((item) => {
      const paragraphs = (item as { content?: RichTextNode[] }).content ?? [];
      return paragraphs.map(nodeText).join(' ');
    })
    .join('\n');
}

function textNode(text: string): RichTextNode {
  return { type: 'paragraph', content: text ? [{ type: 'text', text }] : [] };
}

function createBlock(type: BlockType): RichTextNode {
  switch (type) {
    case 'heading2':
      return { type: 'heading', attrs: { level: 2 }, content: [] };
    case 'heading3':
      return { type: 'heading', attrs: { level: 3 }, content: [] };
    case 'bulletList':
      return { type: 'bulletList', content: [{ type: 'listItem', content: [textNode('')] }] };
    case 'orderedList':
      return { type: 'orderedList', content: [{ type: 'listItem', content: [textNode('')] }] };
    case 'codeBlock':
      return { type: 'codeBlock', attrs: { language: 'text' }, content: [] };
    case 'blockquote':
      return { type: 'blockquote', content: [textNode('')] };
    case 'callout':
      return { type: 'callout', attrs: { variant: 'info' }, content: [textNode('')] };
    case 'image':
      return { type: 'image', attrs: { src: '', alt: '' } };
    case 'video':
      return { type: 'video', attrs: { src: '', provider: 'file' } };
    case 'divider':
      return { type: 'divider' };
    case 'table':
      return {
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [
              { type: 'tableCell', attrs: { header: true }, content: [textNode('Column')] },
              { type: 'tableCell', attrs: { header: true }, content: [textNode('Column')] },
            ],
          },
          {
            type: 'tableRow',
            content: [
              { type: 'tableCell', content: [textNode('')] },
              { type: 'tableCell', content: [textNode('')] },
            ],
          },
        ],
      };
    default:
      return textNode('');
  }
}

function describeBlock(node: RichTextNode): BlockDefinition {
  const type = (node as { type: string }).type;
  const level = (node as { attrs?: { level?: number } }).attrs?.level;

  if (type === 'heading') {
    return BLOCK_TYPES.find((entry) => entry.type === (level === 2 ? 'heading2' : 'heading3'))!;
  }
  return BLOCK_TYPES.find((entry) => entry.type === type) ?? BLOCK_TYPES[0]!;
}

export function RichTextEditor({
  value,
  onChange,
  minBlocks = 1,
}: {
  value: RichTextDocument | null;
  onChange: (document: RichTextDocument) => void;
  minBlocks?: number;
}) {
  const blocks = useMemo(() => value?.content ?? [], [value]);
  const [showPicker, setShowPicker] = useState(false);

  const commit = useCallback(
    (next: RichTextNode[]) => onChange({ type: 'doc', content: next }),
    [onChange],
  );

  const updateBlock = useCallback(
    (index: number, node: RichTextNode) => {
      const next = [...blocks];
      next[index] = node;
      commit(next);
    },
    [blocks, commit],
  );

  const addBlock = useCallback(
    (type: BlockType) => {
      commit([...blocks, createBlock(type)]);
      setShowPicker(false);
    },
    [blocks, commit],
  );

  const removeBlock = useCallback(
    (index: number) => commit(blocks.filter((_, i) => i !== index)),
    [blocks, commit],
  );

  const moveBlock = useCallback(
    (index: number, direction: -1 | 1) => {
      const target = index + direction;
      if (target < 0 || target >= blocks.length) return;
      const next = [...blocks];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved!);
      commit(next);
    },
    [blocks, commit],
  );

  return (
    <div className="space-y-3">
      {blocks.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-text-muted">
          No content yet. Add your first block below.
        </p>
      ) : null}

      <ol className="space-y-3">
        {blocks.map((block, index) => {
          const definition = describeBlock(block);

          return (
            <li key={index} className="group rounded-lg border border-border bg-surface">
              <div className="flex items-center justify-between gap-2 border-b border-border bg-surface-sunken px-3 py-1.5">
                <span className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-text-muted">
                  <definition.Icon className="size-3.5" aria-hidden="true" />
                  {definition.label}
                </span>

                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => moveBlock(index, -1)}
                    disabled={index === 0}
                    className="grid size-7 place-items-center rounded text-text-muted transition-colors hover:bg-surface hover:text-text-primary disabled:opacity-30"
                    aria-label={`Move ${definition.label} up`}
                  >
                    <ArrowUp className="size-3.5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveBlock(index, 1)}
                    disabled={index === blocks.length - 1}
                    className="grid size-7 place-items-center rounded text-text-muted transition-colors hover:bg-surface hover:text-text-primary disabled:opacity-30"
                    aria-label={`Move ${definition.label} down`}
                  >
                    <ArrowDown className="size-3.5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeBlock(index)}
                    disabled={blocks.length <= minBlocks}
                    className="grid size-7 place-items-center rounded text-text-muted transition-colors hover:bg-danger-soft hover:text-danger disabled:opacity-30"
                    aria-label={`Remove ${definition.label}`}
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>

              <div className="p-3">
                <BlockEditor
                  node={block}
                  onChange={(node) => updateBlock(index, node)}
                />
              </div>
            </li>
          );
        })}
      </ol>

      {showPicker ? (
        <div className="rounded-lg border border-border bg-surface p-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {BLOCK_TYPES.map((definition) => (
              <button
                key={definition.type}
                type="button"
                onClick={() => addBlock(definition.type)}
                className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-text-secondary transition-colors hover:border-primary hover:text-primary"
              >
                <definition.Icon className="size-4 shrink-0" aria-hidden="true" />
                {definition.label}
              </button>
            ))}
          </div>
          <Button variant="ghost" size="sm" className="mt-2" onClick={() => setShowPicker(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setShowPicker(true)}>
          <Plus className="size-4" aria-hidden="true" />
          Add block
        </Button>
      )}
    </div>
  );
}

const CONTROL =
  'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';

function BlockEditor({
  node,
  onChange,
}: {
  node: RichTextNode;
  onChange: (node: RichTextNode) => void;
}) {
  const type = (node as { type: string }).type;

  switch (type) {
    case 'paragraph':
    case 'blockquote':
      return (
        <textarea
          value={type === 'paragraph' ? nodeText(node) : nodeText(((node as { content?: RichTextNode[] }).content ?? [])[0] ?? textNode(''))}
          onChange={(event) => {
            const text = event.target.value;
            onChange(
              type === 'paragraph'
                ? textNode(text)
                : { type: 'blockquote', content: [textNode(text)] },
            );
          }}
          rows={type === 'blockquote' ? 2 : 4}
          className={cn(CONTROL, 'resize-y')}
          placeholder={type === 'blockquote' ? 'Quoted text…' : 'Write a paragraph…'}
          aria-label={type === 'blockquote' ? 'Quote text' : 'Paragraph text'}
        />
      );

    case 'heading': {
      const level = (node as { attrs: { level: 2 | 3 | 4 } }).attrs.level;
      return (
        <input
          type="text"
          value={nodeText(node)}
          onChange={(event) =>
            onChange({
              type: 'heading',
              attrs: { level },
              content: event.target.value ? [{ type: 'text', text: event.target.value }] : [],
            })
          }
          className={cn(CONTROL, level === 2 ? 'text-lg font-semibold' : 'font-medium')}
          placeholder="Heading text…"
          aria-label="Heading text"
        />
      );
    }

    case 'bulletList':
    case 'orderedList':
      return (
        <textarea
          value={listText(node)}
          onChange={(event) =>
            onChange({
              type: type as 'bulletList' | 'orderedList',
              content: event.target.value
                .split('\n')
                .map((line) => ({ type: 'listItem', content: [textNode(line)] })),
            } as RichTextNode)
          }
          rows={4}
          className={cn(CONTROL, 'resize-y font-mono text-xs')}
          placeholder={'One item per line'}
          aria-label="List items, one per line"
        />
      );

    case 'codeBlock': {
      const language = (node as { attrs?: { language?: string } }).attrs?.language ?? 'text';
      return (
        <div className="space-y-2">
          <Select
            aria-label="Code language"
            value={language}
            onChange={(event) =>
              onChange({
                type: 'codeBlock',
                attrs: { language: event.target.value },
                content: nodeText(node) ? [{ type: 'text', text: nodeText(node) }] : [],
              })
            }
            options={[
              { value: 'text', label: 'Plain text' },
              { value: 'bash', label: 'Shell' },
              { value: 'javascript', label: 'JavaScript' },
              { value: 'typescript', label: 'TypeScript' },
              { value: 'json', label: 'JSON' },
              { value: 'html', label: 'HTML' },
              { value: 'css', label: 'CSS' },
              { value: 'sql', label: 'SQL' },
              { value: 'python', label: 'Python' },
              { value: 'yaml', label: 'YAML' },
              { value: 'dockerfile', label: 'Dockerfile' },
            ]}
            containerClassName="max-w-48"
          />
          <textarea
            value={nodeText(node)}
            onChange={(event) =>
              onChange({
                type: 'codeBlock',
                attrs: { language },
                content: event.target.value ? [{ type: 'text', text: event.target.value }] : [],
              })
            }
            rows={8}
            spellCheck={false}
            className={cn(CONTROL, 'resize-y font-mono text-xs')}
            placeholder="Paste code…"
            aria-label="Code"
          />
        </div>
      );
    }

    case 'callout': {
      const variant = (node as { attrs?: { variant?: string } }).attrs?.variant ?? 'info';
      const content = (node as { content?: RichTextNode[] }).content ?? [];
      return (
        <div className="space-y-2">
          <Select
            aria-label="Callout style"
            value={variant}
            onChange={(event) =>
              onChange({
                type: 'callout',
                attrs: { variant: event.target.value as 'info' },
                content,
              })
            }
            options={[
              { value: 'info', label: 'Information' },
              { value: 'success', label: 'Success / tip' },
              { value: 'warning', label: 'Warning' },
              { value: 'danger', label: 'Danger' },
            ]}
            containerClassName="max-w-48"
          />
          <textarea
            value={nodeText(content[0] ?? textNode(''))}
            onChange={(event) =>
              onChange({
                type: 'callout',
                attrs: { variant: variant as 'info' },
                content: [textNode(event.target.value)],
              })
            }
            rows={3}
            className={cn(CONTROL, 'resize-y')}
            placeholder="Callout text…"
            aria-label="Callout text"
          />
        </div>
      );
    }

    case 'image': {
      const attrs = (node as { attrs: { src: string; alt?: string; caption?: string } }).attrs;
      return (
        <div className="space-y-2">
          <div className="flex gap-2">
            <Input
              aria-label="Image URL"
              placeholder="https://… or /uploads/…"
              value={attrs.src}
              onChange={(event) =>
                onChange({ type: 'image', attrs: { ...attrs, src: event.target.value } })
              }
              containerClassName="flex-1"
            />
            <MediaPickerButton
              kind="IMAGE"
              onSelect={(media) =>
                onChange({ type: 'image', attrs: { ...attrs, src: media.url } })
              }
            />
          </div>
          <Input
            aria-label="Alt text"
            placeholder="Alt text — describe the image for screen readers"
            value={attrs.alt ?? ''}
            onChange={(event) =>
              onChange({ type: 'image', attrs: { ...attrs, alt: event.target.value } })
            }
          />
          <Input
            aria-label="Caption"
            placeholder="Caption (optional)"
            value={attrs.caption ?? ''}
            onChange={(event) =>
              onChange({ type: 'image', attrs: { ...attrs, caption: event.target.value } })
            }
          />
          {attrs.src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={attrs.src}
              alt=""
              className="max-h-40 rounded-lg border border-border object-contain"
            />
          ) : null}
        </div>
      );
    }

    case 'video': {
      const attrs = (node as { attrs: { src: string; provider?: string; caption?: string } }).attrs;
      return (
        <div className="space-y-2">
          <Select
            aria-label="Video source"
            value={attrs.provider ?? 'file'}
            onChange={(event) =>
              onChange({ type: 'video', attrs: { ...attrs, provider: event.target.value as 'file' } })
            }
            options={[
              { value: 'file', label: 'Uploaded file' },
              { value: 'youtube', label: 'YouTube embed' },
              { value: 'vimeo', label: 'Vimeo embed' },
            ]}
            containerClassName="max-w-48"
          />
          <div className="flex gap-2">
            <Input
              aria-label="Video URL"
              placeholder={
                attrs.provider === 'youtube'
                  ? 'https://www.youtube-nocookie.com/embed/…'
                  : 'https://…'
              }
              value={attrs.src}
              onChange={(event) =>
                onChange({ type: 'video', attrs: { ...attrs, src: event.target.value } })
              }
              containerClassName="flex-1"
            />
            {attrs.provider === 'file' ? (
              <MediaPickerButton
                kind="VIDEO"
                onSelect={(media) =>
                  onChange({ type: 'video', attrs: { ...attrs, src: media.url } })
                }
              />
            ) : null}
          </div>
          <Input
            aria-label="Caption"
            placeholder="Caption (optional)"
            value={attrs.caption ?? ''}
            onChange={(event) =>
              onChange({ type: 'video', attrs: { ...attrs, caption: event.target.value } })
            }
          />
        </div>
      );
    }

    case 'table':
      return <TableBlockEditor node={node} onChange={onChange} />;

    case 'divider':
      return <hr className="border-border" />;

    default:
      return (
        <p className="text-xs text-text-muted">
          This block type has no editor yet and will be preserved as-is.
        </p>
      );
  }
}

function TableBlockEditor({
  node,
  onChange,
}: {
  node: RichTextNode;
  onChange: (node: RichTextNode) => void;
}) {
  const rows = ((node as { content?: RichTextNode[] }).content ?? []) as RichTextNode[];

  function updateCell(rowIndex: number, cellIndex: number, text: string) {
    const nextRows = rows.map((row, r) => {
      if (r !== rowIndex) return row;
      const cells = ((row as { content?: RichTextNode[] }).content ?? []).map((cell, c) => {
        if (c !== cellIndex) return cell;
        const attrs = (cell as { attrs?: Record<string, unknown> }).attrs;
        return { type: 'tableCell', ...(attrs ? { attrs } : {}), content: [textNode(text)] };
      });
      return { type: 'tableRow', content: cells };
    });
    onChange({ type: 'table', content: nextRows } as RichTextNode);
  }

  function addRow() {
    const columnCount = ((rows[0] as { content?: RichTextNode[] })?.content ?? []).length || 2;
    const cells = Array.from({ length: columnCount }, () => ({
      type: 'tableCell',
      content: [textNode('')],
    }));
    onChange({ type: 'table', content: [...rows, { type: 'tableRow', content: cells }] } as RichTextNode);
  }

  function addColumn() {
    const nextRows = rows.map((row, index) => {
      const cells = (row as { content?: RichTextNode[] }).content ?? [];
      return {
        type: 'tableRow',
        content: [
          ...cells,
          index === 0
            ? { type: 'tableCell', attrs: { header: true }, content: [textNode('Column')] }
            : { type: 'tableCell', content: [textNode('')] },
        ],
      };
    });
    onChange({ type: 'table', content: nextRows } as RichTextNode);
  }

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {((row as { content?: RichTextNode[] }).content ?? []).map((cell, cellIndex) => {
                  const isHeader = Boolean((cell as { attrs?: { header?: boolean } }).attrs?.header);
                  return (
                    <td key={cellIndex} className="border border-border p-0">
                      <input
                        type="text"
                        value={nodeText(((cell as { content?: RichTextNode[] }).content ?? [])[0] ?? textNode(''))}
                        onChange={(event) => updateCell(rowIndex, cellIndex, event.target.value)}
                        className={cn(
                          'w-full min-w-28 bg-transparent px-2.5 py-1.5 text-sm focus:bg-primary-soft focus:outline-none',
                          isHeader && 'font-semibold',
                        )}
                        aria-label={`Row ${rowIndex + 1}, column ${cellIndex + 1}`}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex gap-2">
        <Button size="sm" variant="ghost" onClick={addRow}>
          <Plus className="size-3.5" aria-hidden="true" />
          Row
        </Button>
        <Button size="sm" variant="ghost" onClick={addColumn}>
          <Plus className="size-3.5" aria-hidden="true" />
          Column
        </Button>
      </div>
    </div>
  );
}
