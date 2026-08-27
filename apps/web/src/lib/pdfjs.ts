'use client';

/**
 * pdf.js, loaded once per tab.
 *
 * Imported lazily rather than at module scope: it touches browser globals on
 * load and is far too large to sit in an initial bundle, so a page with no
 * document on it should never pay for it. The promise is cached because the
 * gallery can ask for it from two places at once — the reader opening a
 * document and the editor generating a cover — and the worker setup must
 * happen exactly once.
 */

export type PdfModule = typeof import('pdfjs-dist');

let modulePromise: Promise<PdfModule> | null = null;

export function loadPdfjs(): Promise<PdfModule> {
  modulePromise ??= import('pdfjs-dist').then((pdfjs) => {
    // The worker ships with the package and is bundled from this app's own
    // origin, which is what the CSP's `worker-src 'self' blob:` allows.
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url,
    ).toString();
    return pdfjs;
  });

  return modulePromise;
}
