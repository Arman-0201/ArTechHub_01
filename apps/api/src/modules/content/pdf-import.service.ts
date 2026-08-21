import type { RichTextDocument, RichTextNode } from '@academy/types';
import { prisma } from '../../lib/prisma.js';
import { BadRequestError, NotFoundError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { readObject } from '../../lib/storage.js';

/**
 * PDF import.
 *
 * The goal is a lesson that reads like an article on this site, not a PDF in an
 * iframe. The pipeline is:
 *
 *   1. extract text runs with their font size and position (pdfjs);
 *   2. group runs into lines, lines into blocks;
 *   3. classify each block as heading / list item / paragraph using relative
 *      font size and leading-marker heuristics;
 *   4. emit a structured rich-text document the normal renderer understands.
 *
 * PDFs vary enormously, so every stage degrades rather than fails: an
 * unclassifiable block becomes a paragraph, a PDF with no extractable text
 * yields an explicit callout telling the admin to use the original download.
 * The imported document is a *draft* — the admin reviews and edits it before
 * the lesson is published.
 */

interface TextRun {
  text: string;
  fontSize: number;
  x: number;
  y: number;
  page: number;
}

interface TextLine {
  text: string;
  fontSize: number;
  x: number;
  y: number;
  page: number;
}

export interface PdfExtractionResult {
  document: RichTextDocument;
  pageCount: number;
  title: string | null;
  warnings: string[];
  /** Headings detected at the top level, for the split-into-lessons option. */
  outline: { title: string; nodeIndex: number }[];
}

/**
 * pdfjs ships a browser build by default; the `legacy` entry point is the one
 * that runs under Node. It is imported lazily so a deployment that never
 * imports a PDF does not pay the module-load cost.
 */
async function loadPdfJs() {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  return pdfjs;
}

async function extractRuns(buffer: Buffer): Promise<{ runs: TextRun[]; pageCount: number }> {
  const pdfjs = await loadPdfJs();

  const task = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    // No network fetches, no font rendering — text extraction only.
    disableFontFace: true,
    useSystemFonts: false,
    isEvalSupported: false,
  });

  const document = await task.promise;
  const runs: TextRun[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();

      for (const item of content.items) {
        const typed = item as { str?: string; transform?: number[]; height?: number };
        const text = typed.str ?? '';
        if (!text.trim()) continue;

        const transform = typed.transform ?? [1, 0, 0, 1, 0, 0];
        runs.push({
          text,
          // transform[3] is the vertical scale, which tracks the rendered size
          // more reliably than the reported height for many generators.
          fontSize: Math.abs(transform[3] ?? typed.height ?? 12),
          x: transform[4] ?? 0,
          y: transform[5] ?? 0,
          page: pageNumber,
        });
      }

      page.cleanup();
    }
  } finally {
    await document.destroy();
  }

  return { runs, pageCount: document.numPages };
}

/** Groups runs sharing a baseline into lines, in reading order. */
function groupIntoLines(runs: TextRun[]): TextLine[] {
  const lines: TextLine[] = [];
  const byPage = new Map<number, TextRun[]>();

  for (const run of runs) {
    const bucket = byPage.get(run.page) ?? [];
    bucket.push(run);
    byPage.set(run.page, bucket);
  }

  for (const [page, pageRuns] of [...byPage.entries()].sort((a, b) => a[0] - b[0])) {
    // PDF y grows upward, so descending y is top-to-bottom.
    const sorted = [...pageRuns].sort((a, b) => (b.y - a.y) || (a.x - b.x));

    let current: TextRun[] = [];
    let currentY: number | null = null;

    const flush = () => {
      if (current.length === 0) return;
      const ordered = [...current].sort((a, b) => a.x - b.x);
      const text = ordered
        .map((run) => run.text)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (text) {
        lines.push({
          text,
          fontSize: Math.max(...ordered.map((run) => run.fontSize)),
          x: Math.min(...ordered.map((run) => run.x)),
          y: currentY ?? 0,
          page,
        });
      }
      current = [];
    };

    for (const run of sorted) {
      // A 2.5pt tolerance absorbs sub-pixel baseline jitter without merging
      // genuinely separate lines.
      if (currentY === null || Math.abs(run.y - currentY) <= 2.5) {
        current.push(run);
        currentY = currentY ?? run.y;
      } else {
        flush();
        current = [run];
        currentY = run.y;
      }
    }
    flush();
  }

  return lines;
}

const BULLET_PATTERN = /^[•‣▪●·*-]\s+/;
const ORDERED_PATTERN = /^(\d{1,2})[.)]\s+/;

function median(values: number[]): number {
  if (values.length === 0) return 12;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 12) + (sorted[middle] ?? 12)) / 2
    : (sorted[middle] ?? 12);
}

function textNode(text: string): RichTextNode {
  return { type: 'paragraph', content: [{ type: 'text', text }] };
}

function headingNode(text: string, level: 2 | 3 | 4): RichTextNode {
  return { type: 'heading', attrs: { level }, content: [{ type: 'text', text }] };
}

/**
 * Converts lines into blocks.
 *
 * Classification is relative, not absolute: heading thresholds are multiples of
 * the document's median body size, so a PDF typeset at 9pt and one at 14pt are
 * both handled without tuning.
 */
function linesToDocument(lines: TextLine[]): {
  document: RichTextDocument;
  title: string | null;
  outline: { title: string; nodeIndex: number }[];
} {
  const bodySize = median(lines.map((line) => line.fontSize));
  const nodes: RichTextNode[] = [];
  const outline: { title: string; nodeIndex: number }[] = [];

  let title: string | null = null;
  let paragraphBuffer: string[] = [];
  let listBuffer: { text: string; ordered: boolean }[] = [];

  const flushParagraph = () => {
    if (paragraphBuffer.length === 0) return;
    const text = paragraphBuffer.join(' ').replace(/\s+/g, ' ').trim();
    if (text) nodes.push(textNode(text));
    paragraphBuffer = [];
  };

  const flushList = () => {
    if (listBuffer.length === 0) return;
    const ordered = listBuffer[0]!.ordered;
    nodes.push({
      type: ordered ? 'orderedList' : 'bulletList',
      content: listBuffer.map((item) => ({
        type: 'listItem',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: item.text }] }],
      })),
    } as RichTextNode);
    listBuffer = [];
  };

  const flushAll = () => {
    flushParagraph();
    flushList();
  };

  for (const line of lines) {
    const text = line.text.trim();
    if (!text) continue;

    // Drop page furniture: a bare number on its own line is a page marker.
    if (/^\d{1,4}$/.test(text) && line.fontSize <= bodySize) continue;

    const bulletMatch = BULLET_PATTERN.exec(text);
    const orderedMatch = ORDERED_PATTERN.exec(text);

    if (bulletMatch || orderedMatch) {
      flushParagraph();
      listBuffer.push({
        text: text.replace(BULLET_PATTERN, '').replace(ORDERED_PATTERN, '').trim(),
        ordered: Boolean(orderedMatch),
      });
      continue;
    }

    const sizeRatio = line.fontSize / bodySize;
    const looksLikeHeading =
      // Either visibly larger than body text...
      sizeRatio >= 1.18 ||
      // ...or short, unpunctuated and title-cased, which catches bold headings
      // that share the body font size.
      (text.length <= 70 && !/[.!?;:,]$/.test(text) && /^[A-ZЀ-ӿ԰-֏]/.test(text) && sizeRatio >= 1.05);

    if (looksLikeHeading) {
      flushAll();

      // The largest text on the first page is treated as the document title
      // rather than a body heading.
      if (!title && line.page === 1 && sizeRatio >= 1.4) {
        title = text;
        continue;
      }

      const level: 2 | 3 | 4 = sizeRatio >= 1.5 ? 2 : sizeRatio >= 1.25 ? 3 : 4;
      if (level === 2) outline.push({ title: text, nodeIndex: nodes.length });
      nodes.push(headingNode(text, level));
      continue;
    }

    flushList();

    // A line ending mid-sentence continues the current paragraph; PDFs break
    // lines for layout, not for meaning.
    paragraphBuffer.push(text);
    if (/[.!?]["')\]]?$/.test(text)) flushParagraph();
  }

  flushAll();

  return { document: { type: 'doc', content: nodes }, title, outline };
}

export async function extractPdfContent(mediaId: string): Promise<PdfExtractionResult> {
  const media = await prisma.media.findUnique({
    where: { id: mediaId },
    select: { id: true, mimeType: true, storageKey: true, storageDriver: true, originalName: true },
  });
  if (!media) throw new NotFoundError('Media');
  if (media.mimeType !== 'application/pdf') {
    throw new BadRequestError('The selected file is not a PDF');
  }

  const buffer = await readObject(media.storageKey, media.storageDriver);
  const warnings: string[] = [];

  let runs: TextRun[] = [];
  let pageCount = 0;

  try {
    const extracted = await extractRuns(buffer);
    runs = extracted.runs;
    pageCount = extracted.pageCount;
  } catch (error) {
    logger.error({ err: error, mediaId }, 'PDF text extraction failed');
    throw new BadRequestError(
      'This PDF could not be read. It may be encrypted or corrupted — attach it as a download instead.',
    );
  }

  if (runs.length === 0) {
    // Scanned documents are images with no text layer. Say so plainly instead
    // of producing an empty lesson.
    warnings.push(
      'No selectable text was found. This looks like a scanned document — OCR it first, or offer the PDF as a download.',
    );
    return {
      document: {
        type: 'doc',
        content: [
          {
            type: 'callout',
            attrs: { variant: 'warning' },
            content: [
              textNode(
                'This PDF contains no extractable text. Replace this content with the lesson text, or link the original file as a download.',
              ),
            ],
          },
        ],
      },
      pageCount,
      title: null,
      warnings,
      outline: [],
    };
  }

  const lines = groupIntoLines(runs);
  const { document, title, outline } = linesToDocument(lines);

  if (document.content.length === 0) {
    warnings.push('The PDF produced no readable blocks. Review the imported lesson carefully.');
  }
  if (outline.length === 0) {
    warnings.push('No top-level headings were detected, so this import cannot be split by heading.');
  }
  warnings.push('Imported content is a draft. Review formatting, images and code blocks before publishing.');

  return {
    document,
    pageCount,
    title: title ?? media.originalName.replace(/\.pdf$/i, ''),
    warnings,
    outline,
  };
}

/** Splits an imported document into one document per top-level heading. */
export function splitDocumentByHeadings(
  document: RichTextDocument,
  outline: { title: string; nodeIndex: number }[],
): { title: string; document: RichTextDocument }[] {
  if (outline.length === 0) return [];

  const sections: { title: string; document: RichTextDocument }[] = [];

  for (let index = 0; index < outline.length; index += 1) {
    const current = outline[index]!;
    const next = outline[index + 1];
    // Skip the heading node itself: it becomes the lesson title.
    const start = current.nodeIndex + 1;
    const end = next ? next.nodeIndex : document.content.length;

    sections.push({
      title: current.title,
      document: { type: 'doc', content: document.content.slice(start, end) },
    });
  }

  return sections;
}
