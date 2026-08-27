'use client';

import { loadPdfjs } from '@/lib/pdfjs';

/**
 * Cover images, rendered from page one.
 *
 * The generation happens in the editor's browser, at the moment a document is
 * added, and the result is uploaded as an ordinary image. That is the whole
 * trick: the visitor's browser never renders a thumbnail, so a marketing page
 * showing thirty documents costs thirty `<img>` tags rather than thirty copies
 * of pdf.js, and the server needs no rasteriser — the one place a canvas and a
 * PDF engine already sit together is the admin panel.
 *
 * Everything here is best-effort. An encrypted, malformed or slow document
 * simply produces no cover, and the gallery falls back to its placeholder; a
 * failure to draw a picture must never stop a document being published.
 */

export interface PdfCoverRender {
  blob: Blob;
  pageCount: number;
}

/** Wide enough to stay sharp in a grid tile and on a retina screen. */
const COVER_WIDTH_PX = 760;

/**
 * JPEG, not PNG. A rendered page is a photograph-like image once it carries
 * any figure or shading, and the PNG of the same page is routinely five times
 * the size for no visible gain in a 200px tile.
 */
const COVER_MIME_TYPE = 'image/jpeg';
const COVER_QUALITY = 0.82;

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('The cover image could not be encoded.'))),
      COVER_MIME_TYPE,
      COVER_QUALITY,
    );
  });
}

/**
 * Renders the first page of a PDF to a JPEG, and counts its pages.
 *
 * `source` is either the file the editor just chose — read locally, so nothing
 * is fetched — or the same-origin stream path of a document already in the
 * library.
 */
export async function renderPdfCover(source: File | string): Promise<PdfCoverRender> {
  const pdfjs = await loadPdfjs();

  const task = pdfjs.getDocument(
    typeof source === 'string'
      ? { url: source, withCredentials: true, isEvalSupported: false, enableXfa: false }
      : // `data` detaches the buffer, which is fine — it is read once and
        // discarded — and avoids a round trip for a file already in memory.
        { data: new Uint8Array(await source.arrayBuffer()), isEvalSupported: false, enableXfa: false },
  );

  const document = await task.promise;

  try {
    const page = await document.getPage(1);
    const unscaled = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: COVER_WIDTH_PX / unscaled.width });

    const canvas = window.document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);

    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser cannot render a cover image.');

    // A PDF page is transparent where it is blank, and a transparent JPEG
    // encodes as black. Paint the paper first.
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvasContext: context, viewport }).promise;

    const blob = await canvasToBlob(canvas);

    // Release the bitmap immediately rather than waiting for the collector;
    // an editor adding ten documents in a row would otherwise hold ten.
    canvas.width = 0;
    canvas.height = 0;
    page.cleanup();

    return { blob, pageCount: document.numPages };
  } finally {
    void document.destroy();
  }
}

/** `annual-report.pdf` → `annual-report-cover.jpg`, for the media library. */
export function coverFileName(pdfFileName: string): string {
  const base = pdfFileName.replace(/\.pdf$/i, '').slice(0, 80) || 'document';
  return `${base}-cover.jpg`;
}
