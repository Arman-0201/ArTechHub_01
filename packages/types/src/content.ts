/**
 * Structured rich-text document format.
 *
 * Lesson/article bodies are stored as this JSON tree rather than raw HTML: it is
 * safe by construction (there is no place to put a `<script>`), it survives the
 * PDF-import pipeline, and it can be rendered to HTML, plain text (for search
 * indexing) or a reading-time estimate without an HTML parser.
 */

export type RichTextMark =
  | { type: 'bold' }
  | { type: 'italic' }
  | { type: 'underline' }
  | { type: 'strike' }
  | { type: 'code' }
  | { type: 'link'; href: string; target?: '_blank' | '_self' };

export interface RichTextText {
  type: 'text';
  text: string;
  marks?: RichTextMark[];
}

export type RichTextInline = RichTextText | { type: 'hardBreak' };

export interface RichTextNodeBase {
  type: string;
  attrs?: Record<string, unknown>;
  content?: RichTextNode[];
}

export type RichTextNode =
  | RichTextInline
  | { type: 'paragraph'; content?: RichTextInline[] }
  | { type: 'heading'; attrs: { level: 2 | 3 | 4 }; content?: RichTextInline[] }
  | { type: 'bulletList'; content?: RichTextNode[] }
  | { type: 'orderedList'; attrs?: { start?: number }; content?: RichTextNode[] }
  | { type: 'listItem'; content?: RichTextNode[] }
  | { type: 'blockquote'; content?: RichTextNode[] }
  | { type: 'codeBlock'; attrs?: { language?: string }; content?: RichTextInline[] }
  | { type: 'image'; attrs: { src: string; alt?: string; caption?: string; width?: number; height?: number } }
  | { type: 'video'; attrs: { src: string; provider?: 'file' | 'youtube' | 'vimeo'; poster?: string; caption?: string } }
  | { type: 'callout'; attrs?: { variant?: 'info' | 'success' | 'warning' | 'danger' }; content?: RichTextNode[] }
  | { type: 'table'; content?: RichTextNode[] }
  | { type: 'tableRow'; content?: RichTextNode[] }
  | { type: 'tableCell'; attrs?: { header?: boolean; colspan?: number }; content?: RichTextNode[] }
  | { type: 'divider' }
  | { type: 'embed'; attrs: { url: string; title?: string } }
  | RichTextNodeBase;

export interface RichTextDocument {
  type: 'doc';
  content: RichTextNode[];
}

export const EMPTY_RICH_TEXT: RichTextDocument = { type: 'doc', content: [] };

/** Every block type the editor toolbar and the renderer must both support. */
export const RICH_TEXT_BLOCK_TYPES = [
  'paragraph',
  'heading',
  'bulletList',
  'orderedList',
  'blockquote',
  'codeBlock',
  'image',
  'video',
  'callout',
  'table',
  'divider',
  'embed',
] as const;
