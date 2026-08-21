import { z } from 'zod';
import { SECTION_TYPES } from '@academy/types';
import { httpUrlSchema, linkTargetSchema } from './common.js';

/**
 * Rich-text validation.
 *
 * The document is a recursive tree, so the schema is defined with `z.lazy`.
 * Two rules matter for security rather than data quality:
 *   1. `link` marks and media `src` values must be http(s) or site-relative —
 *      this is what stops a stored `javascript:` URL from becoming an XSS sink.
 *   2. Unknown node types are rejected, so the renderer never meets a node it
 *      has no component for.
 */

const safeSrcSchema = z
  .string()
  .trim()
  .min(1)
  .max(2048)
  .refine(
    (value) => /^https?:\/\//i.test(value) || value.startsWith('/'),
    'Media sources must be http(s) URLs or site-relative paths',
  );

const markSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('bold') }),
  z.object({ type: z.literal('italic') }),
  z.object({ type: z.literal('underline') }),
  z.object({ type: z.literal('strike') }),
  z.object({ type: z.literal('code') }),
  z.object({
    type: z.literal('link'),
    href: linkTargetSchema,
    target: z.enum(['_blank', '_self']).optional(),
  }),
]);

const textNodeSchema = z.object({
  type: z.literal('text'),
  text: z.string().max(20000),
  marks: z.array(markSchema).max(8).optional(),
});

const hardBreakSchema = z.object({ type: z.literal('hardBreak') });

const inlineSchema = z.union([textNodeSchema, hardBreakSchema]);

export const richTextNodeSchema: z.ZodType<unknown> = z.lazy(() =>
  z.discriminatedUnion('type', [
    textNodeSchema,
    hardBreakSchema,
    z.object({ type: z.literal('paragraph'), content: z.array(inlineSchema).max(500).optional() }),
    z.object({
      type: z.literal('heading'),
      attrs: z.object({ level: z.union([z.literal(2), z.literal(3), z.literal(4)]) }),
      content: z.array(inlineSchema).max(200).optional(),
    }),
    z.object({ type: z.literal('bulletList'), content: z.array(richTextNodeSchema).max(500).optional() }),
    z.object({
      type: z.literal('orderedList'),
      attrs: z.object({ start: z.number().int().min(1).max(10000).optional() }).optional(),
      content: z.array(richTextNodeSchema).max(500).optional(),
    }),
    z.object({ type: z.literal('listItem'), content: z.array(richTextNodeSchema).max(200).optional() }),
    z.object({ type: z.literal('blockquote'), content: z.array(richTextNodeSchema).max(200).optional() }),
    z.object({
      type: z.literal('codeBlock'),
      attrs: z.object({ language: z.string().trim().max(32).optional() }).optional(),
      content: z.array(inlineSchema).max(200).optional(),
    }),
    z.object({
      type: z.literal('image'),
      attrs: z.object({
        src: safeSrcSchema,
        alt: z.string().max(300).optional(),
        caption: z.string().max(500).optional(),
        width: z.number().int().min(1).max(10000).optional(),
        height: z.number().int().min(1).max(10000).optional(),
      }),
    }),
    z.object({
      type: z.literal('video'),
      attrs: z.object({
        src: safeSrcSchema,
        provider: z.enum(['file', 'youtube', 'vimeo']).optional(),
        poster: safeSrcSchema.optional(),
        caption: z.string().max(500).optional(),
      }),
    }),
    z.object({
      type: z.literal('callout'),
      attrs: z.object({ variant: z.enum(['info', 'success', 'warning', 'danger']).optional() }).optional(),
      content: z.array(richTextNodeSchema).max(200).optional(),
    }),
    z.object({ type: z.literal('table'), content: z.array(richTextNodeSchema).max(200).optional() }),
    z.object({ type: z.literal('tableRow'), content: z.array(richTextNodeSchema).max(50).optional() }),
    z.object({
      type: z.literal('tableCell'),
      attrs: z
        .object({ header: z.boolean().optional(), colspan: z.number().int().min(1).max(20).optional() })
        .optional(),
      content: z.array(richTextNodeSchema).max(100).optional(),
    }),
    z.object({ type: z.literal('divider') }),
    z.object({
      type: z.literal('embed'),
      attrs: z.object({ url: httpUrlSchema, title: z.string().max(200).optional() }),
    }),
  ]),
);

export const richTextDocumentSchema = z.object({
  type: z.literal('doc'),
  content: z.array(richTextNodeSchema).max(3000),
});

export type RichTextDocumentInput = z.infer<typeof richTextDocumentSchema>;

export const nullableRichText = richTextDocumentSchema.nullable().optional();

/* ----------------------------------------------------------- page sections */

export const sectionTypeSchema = z.enum(SECTION_TYPES as unknown as [string, ...string[]]);

/**
 * Section `settings` and `content` are intentionally open records: each section
 * type owns its own shape and the renderer reads defensively. What is NOT open
 * is the section type itself, and the HTML section, whose markup is sanitised
 * server-side before it is ever stored.
 */
export const pageSectionSchema = z.object({
  type: sectionTypeSchema,
  sortOrder: z.number().int().min(0).max(10000).default(0),
  isVisible: z.boolean().default(true),
  settings: z.record(z.unknown()).default({}),
  content: z.record(z.unknown()).default({}),
});

export const createPageSectionSchema = pageSectionSchema;
export const updatePageSectionSchema = pageSectionSchema.partial();
