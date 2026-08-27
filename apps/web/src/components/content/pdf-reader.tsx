'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Download,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { cn, formatFileSize } from '@/lib/utils';
import { loadPdfjs, type PdfModule } from '@/lib/pdfjs';

/**
 * In-browser PDF reader.
 *
 * Reads the document where it lives instead of downloading it: pdf.js pulls
 * byte ranges from a same-origin endpoint, so the first page paints while the
 * rest of the file is still arriving and a large document opens as fast as a
 * small one. Nothing is written to disk.
 *
 * Rendering is per page and on demand. A page canvas is created when the page
 * approaches the viewport and released when it leaves, which keeps a
 * three-hundred-page textbook at a handful of canvases rather than three
 * hundred; at four bytes per device pixel, doing otherwise is how a reader runs
 * a laptop out of memory.
 *
 * Two callers, one component. A lesson's source PDF streams from an
 * access-controlled route that authenticates with the reader's own session and
 * disappears when an operator switches `PDF_READER_ENABLED` off — see
 * `LearnShell`. A CMS page's PDF gallery streams a document an editor
 * published, from `/api/v1/documents/:id` — see `PdfGallerySection`. Which
 * bytes may be served is the server's decision in both cases; all this needs
 * is a URL, a name and a size.
 */

/**
 * A document this reader can open.
 *
 * `url` is a same-origin path, not the object-storage URL: pdf.js reads through
 * `fetch`, so the bytes have to come from an origin the app's `connect-src`
 * names, and range support is what makes progressive rendering possible at all.
 * `sizeBytes` lets the loading state show real progress rather than an
 * indeterminate spinner. `LessonPdfReaderDto` satisfies this shape.
 */
export interface PdfReaderSource {
  url: string;
  fileName: string;
  sizeBytes: number;
}

/** Enough pages to cover a scroll flick without rendering the whole document. */
const RENDER_MARGIN_PX = 800;

const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];

/**
 * Canvas backing scale. Retina sharpness is worth 2x; beyond that the memory
 * cost quadruples for a difference nobody can see on a printed-page render.
 */
const MAX_PIXEL_RATIO = 2;

type PdfDocument = Awaited<ReturnType<PdfModule['getDocument']>['promise']>;
type PdfPageProxy = Awaited<ReturnType<PdfDocument['getPage']>>;

interface ReaderState {
  status: 'loading' | 'ready' | 'error';
  document: PdfDocument | null;
  pdfjs: PdfModule | null;
  pageCount: number;
  /** 0–1 while the document downloads; null once pdf.js stops reporting. */
  progress: number | null;
  message: string | null;
}

const INITIAL_STATE: ReaderState = {
  status: 'loading',
  document: null,
  pdfjs: null,
  pageCount: 0,
  progress: 0,
  message: null,
};

function storageKey(documentId: string): string {
  return `academy.pdf-reader.${documentId}.page`;
}

/**
 * Where this reader left off, per document.
 *
 * Deliberately local rather than server-side: it is a scroll position, not
 * progress. Lesson completion is the server's business and is recorded through
 * the normal endpoint; remembering which page a tab was on does not deserve a
 * write, and being wrong about it costs a scroll.
 */
function readSavedPage(documentId: string): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(storageKey(documentId));
    const page = raw ? Number.parseInt(raw, 10) : Number.NaN;
    return Number.isFinite(page) && page > 0 ? page : null;
  } catch {
    return null;
  }
}

function savePage(documentId: string, page: number): void {
  try {
    window.localStorage.setItem(storageKey(documentId), String(page));
  } catch {
    /* Private mode, or storage full. The reader works without it. */
  }
}

export function PdfReader({
  pdf,
  documentId,
  downloadUrl,
  height = 'inline',
  className,
}: {
  pdf: PdfReaderSource;
  documentId: string;
  /** The original file, for readers who would rather have it offline. */
  downloadUrl: string | null;
  /**
   * `inline` sizes the reading pane itself, for a reader sitting in a page's
   * flow. `fill` hands that decision to the parent — the gallery's overlay is
   * already the size of the window, so the reader stretches to it and the
   * expand control, which would have nothing left to expand into, is dropped.
   */
  height?: 'inline' | 'fill';
  className?: string;
}) {
  const [state, setState] = useState<ReaderState>(INITIAL_STATE);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoomIndex, setZoomIndex] = useState(2);
  const [isExpanded, setIsExpanded] = useState(false);
  const [baseScale, setBaseScale] = useState(1);

  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef(new Map<number, HTMLDivElement>());
  const restoredRef = useRef(false);
  const scrollFrameRef = useRef<number | null>(null);

  const zoom = ZOOM_STEPS[zoomIndex] ?? 1;
  const scale = baseScale * zoom;

  /* ------------------------------------------------------------- loading */

  useEffect(() => {
    let cancelled = false;
    let loadingTask: ReturnType<PdfModule['getDocument']> | null = null;

    async function load() {
      try {
        // Loaded on demand, not at module scope: pdf.js touches browser globals
        // and is far too large to sit in the initial bundle, so a page without a
        // document on it should never pay for it.
        const pdfjs = await loadPdfjs();

        loadingTask = pdfjs.getDocument({
          url: pdf.url,
          // A lesson stream is authorised by the session cookie, so the request
          // has to carry credentials. It is same-origin — the web app proxies
          // it — which is what makes that cookie available at all. A published
          // document needs no session, and sending one costs nothing.
          withCredentials: true,
          // Fetch what the reader is looking at, not the whole file. Combined
          // with the range support on the endpoint, this is what makes a large
          // document open immediately.
          disableAutoFetch: true,
          disableStream: false,
          rangeChunkSize: 256 * 1024,
          // Neither is needed to read a document, and both are attack surface
          // in a file the platform did not author.
          isEvalSupported: false,
          enableXfa: false,
        });

        loadingTask.onProgress = ({ loaded, total }: { loaded: number; total: number }) => {
          if (cancelled) return;
          const size = total || pdf.sizeBytes;
          setState((previous) =>
            previous.status === 'loading'
              ? { ...previous, progress: size > 0 ? Math.min(1, loaded / size) : null }
              : previous,
          );
        };

        const document = await loadingTask.promise;
        if (cancelled) {
          void document.destroy();
          return;
        }

        setState({
          status: 'ready',
          document,
          pdfjs,
          pageCount: document.numPages,
          progress: null,
          message: null,
        });
      } catch (error) {
        if (cancelled) return;
        setState({
          status: 'error',
          document: null,
          pdfjs: null,
          pageCount: 0,
          progress: null,
          message: describeFailure(error),
        });
      }
    }

    void load();

    return () => {
      cancelled = true;
      // Destroying the task also tears down the worker and aborts any range
      // request still in flight, which matters when a reader clicks through
      // lessons faster than a document loads.
      void loadingTask?.destroy();
    };
  }, [pdf.url, pdf.sizeBytes]);

  /* --------------------------------------------------------- fit to width */

  const measure = useCallback(async () => {
    const container = scrollRef.current;
    const document = state.document;
    if (!container || !document) return;

    const page = await document.getPage(1);
    const viewport = page.getViewport({ scale: 1 });
    // 32px for the page gutter, so a fitted page is not flush with the frame.
    const available = Math.max(240, container.clientWidth - 32);
    setBaseScale(available / viewport.width);
  }, [state.document]);

  // A plain effect, not a layout effect: nothing is measured until the document
  // has loaded, which cannot happen during a server render, and a layout effect
  // in a component React renders on the server only earns a warning.
  useEffect(() => {
    if (state.status !== 'ready') return;
    void measure();

    const container = scrollRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(() => void measure());
    observer.observe(container);
    return () => observer.disconnect();
  }, [state.status, measure, isExpanded]);

  /* ------------------------------------------------------- page tracking */

  const scrollToPage = useCallback((page: number) => {
    const element = pageRefs.current.get(page);
    if (element) element.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, []);

  const registerPage = useCallback((page: number, element: HTMLDivElement | null) => {
    if (element) pageRefs.current.set(page, element);
    else pageRefs.current.delete(page);
  }, []);

  /**
   * The page indicator follows the scroll position rather than the other way
   * round: whichever page occupies the top of the frame is the page the reader
   * is on. Reading is the input; the counter is the readout.
   */
  const handleScroll = useCallback(() => {
    // Coalesced to one measurement per frame. A scroll event fires far more
    // often than that, and this walks every page in the document.
    if (scrollFrameRef.current !== null) return;

    scrollFrameRef.current = window.requestAnimationFrame(() => {
      scrollFrameRef.current = null;

      const container = scrollRef.current;
      if (!container) return;

      const anchor = container.scrollTop + container.clientHeight * 0.25;
      let closest = 1;
      for (const [page, element] of pageRefs.current) {
        if (element.offsetTop <= anchor) closest = Math.max(closest, page);
      }
      setCurrentPage(closest);
    });
  }, []);

  useEffect(
    () => () => {
      if (scrollFrameRef.current !== null) window.cancelAnimationFrame(scrollFrameRef.current);
    },
    [],
  );

  useEffect(() => {
    if (state.status !== 'ready') return;
    savePage(documentId, currentPage);
  }, [documentId, currentPage, state.status]);

  // Restore the saved page once, after the first layout pass has given the
  // pages a height to scroll to.
  useEffect(() => {
    if (state.status !== 'ready' || restoredRef.current) return;
    restoredRef.current = true;

    const saved = readSavedPage(documentId);
    if (!saved || saved <= 1 || saved > state.pageCount) return;

    const timer = window.setTimeout(() => {
      const element = pageRefs.current.get(saved);
      if (element) element.scrollIntoView({ block: 'start' });
    }, 150);
    return () => window.clearTimeout(timer);
  }, [state.status, state.pageCount, documentId]);

  /* ---------------------------------------------------------------- view */

  const pages = useMemo(
    () => Array.from({ length: state.pageCount }, (_, index) => index + 1),
    [state.pageCount],
  );

  const isFilled = height === 'fill';

  if (state.status === 'error') {
    return (
      <ReaderFrame fill={isFilled} className={className}>
        <div
          className={cn(
            'flex flex-col items-center justify-center gap-3 px-6 py-12 text-center',
            isFilled && 'min-h-0 flex-1',
          )}
        >
          <AlertTriangle className="size-6 text-warning" aria-hidden="true" />
          <p className="text-sm text-text-secondary">{state.message}</p>
          {downloadUrl ? (
            <a
              href={downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-primary hover:underline"
            >
              Download the PDF instead
            </a>
          ) : null}
        </div>
      </ReaderFrame>
    );
  }

  return (
    <ReaderFrame fill={isFilled} className={className}>
      <Toolbar
        currentPage={currentPage}
        pageCount={state.pageCount}
        zoom={zoom}
        canZoomOut={zoomIndex > 0}
        canZoomIn={zoomIndex < ZOOM_STEPS.length - 1}
        isExpanded={isExpanded}
        canExpand={!isFilled}
        isLoading={state.status === 'loading'}
        fileName={pdf.fileName}
        downloadUrl={downloadUrl}
        onGoToPage={(page) => {
          setCurrentPage(page);
          scrollToPage(page);
        }}
        onZoomOut={() => setZoomIndex((index) => Math.max(0, index - 1))}
        onZoomIn={() => setZoomIndex((index) => Math.min(ZOOM_STEPS.length - 1, index + 1))}
        onToggleExpanded={() => setIsExpanded((expanded) => !expanded)}
      />

      {state.status === 'loading' ? (
        <LoadingPane
          progress={state.progress}
          sizeBytes={pdf.sizeBytes}
          className={isFilled ? 'min-h-0 flex-1 justify-center' : undefined}
        />
      ) : null}

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        tabIndex={0}
        role="document"
        aria-label={`${pdf.fileName}, ${state.pageCount} pages`}
        className={cn(
          'overflow-auto overscroll-contain bg-surface-sunken outline-none',
          'focus-visible:ring-2 focus-visible:ring-border-focus',
          isFilled
            ? 'min-h-0 flex-1'
            : isExpanded
              ? 'h-[calc(100dvh-12rem)]'
              : 'h-[70vh] min-h-100 max-h-200',
          state.status === 'loading' && 'hidden',
        )}
      >
        <div className="flex flex-col items-center gap-4 p-4">
          {state.document && state.pdfjs
            ? pages.map((page) => (
                <PdfPageView
                  key={page}
                  pageNumber={page}
                  document={state.document as PdfDocument}
                  pdfjs={state.pdfjs as PdfModule}
                  scale={scale}
                  root={scrollRef}
                  register={registerPage}
                />
              ))
            : null}
        </div>
      </div>
    </ReaderFrame>
  );
}

/* ------------------------------------------------------------------ page */

/**
 * One page.
 *
 * Two layers, as pdf.js intends: a canvas for what the page looks like, and a
 * transparent layer of positioned text on top so the words can be selected,
 * copied and found with the browser's own search. A canvas alone would render a
 * document a reader cannot quote from.
 */
function PdfPageView({
  pageNumber,
  document,
  pdfjs,
  scale,
  root,
  register,
}: {
  pageNumber: number;
  document: PdfDocument;
  pdfjs: PdfModule;
  scale: number;
  root: React.RefObject<HTMLDivElement | null>;
  register: (page: number, element: HTMLDivElement | null) => void;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);

  const [isNear, setIsNear] = useState(pageNumber <= 2);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    const element = wrapperRef.current;
    register(pageNumber, element);
    return () => register(pageNumber, null);
  }, [pageNumber, register]);

  // A page is prepared slightly before it is needed, and forgotten once it is
  // well out of the way.
  useEffect(() => {
    const element = wrapperRef.current;
    if (!element || typeof IntersectionObserver === 'undefined') {
      setIsNear(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) setIsNear(entry.isIntersecting);
      },
      { root: root.current, rootMargin: `${RENDER_MARGIN_PX}px 0px` },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [root]);

  /**
   * The placeholder has to be the right size before the page renders, or every
   * page would start at zero height, the whole document would collapse into one
   * screen, and every page would look "near" at once. Dimensions come from the
   * page metadata, which is cheap; the pixels come later.
   */
  useEffect(() => {
    let cancelled = false;
    void document.getPage(pageNumber).then((page: PdfPageProxy) => {
      if (cancelled) return;
      const viewport = page.getViewport({ scale });
      setSize({ width: viewport.width, height: viewport.height });
    });
    return () => {
      cancelled = true;
    };
  }, [document, pageNumber, scale]);

  /**
   * Releasing a page costs a line and saves four bytes per device pixel. A
   * canvas keeps its bitmap for as long as it has dimensions, so leaving a
   * scrolled-past page "rendered but invisible" would accumulate the whole
   * document in memory — the thing the lazy render exists to avoid.
   */
  useEffect(() => {
    if (isNear) return;

    const canvas = canvasRef.current;
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
    textLayerRef.current?.replaceChildren();
  }, [isNear]);

  useEffect(() => {
    if (!isNear || !size) return;

    let cancelled = false;
    let renderTask: ReturnType<PdfPageProxy['render']> | null = null;
    let page: PdfPageProxy | null = null;

    async function render() {
      const canvas = canvasRef.current;
      if (!canvas) return;

      page = await document.getPage(pageNumber);
      if (cancelled) return;

      const viewport = page.getViewport({ scale });
      const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);

      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;

      const context = canvas.getContext('2d');
      if (!context) return;

      const task = page.render({
        canvasContext: context,
        viewport,
        transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
      });
      renderTask = task;

      try {
        await task.promise;
      } catch (error) {
        // Cancelling is how a re-render at a new zoom level begins, so it is
        // the expected outcome, not a failure.
        if (!(error instanceof pdfjs.RenderingCancelledException)) throw error;
        return;
      }
      if (cancelled) return;

      const textContainer = textLayerRef.current;
      if (textContainer) {
        textContainer.replaceChildren();
        const textLayer = new pdfjs.TextLayer({
          textContentSource: page.streamTextContent(),
          container: textContainer,
          viewport,
        });
        await textLayer.render();
      }
    }

    void render().catch(() => {
      /* One page that will not draw must not take the document down. */
    });

    return () => {
      cancelled = true;
      renderTask?.cancel();
      page?.cleanup();
    };
  }, [isNear, size, document, pageNumber, scale, pdfjs]);

  return (
    <div
      ref={wrapperRef}
      data-page={pageNumber}
      // pdf.js positions text-layer spans against this variable.
      style={
        {
          width: size ? `${size.width}px` : undefined,
          height: size ? `${size.height}px` : undefined,
          '--scale-factor': scale,
        } as React.CSSProperties
      }
      role="region"
      aria-label={`Page ${pageNumber}`}
      className="pdf-page relative shrink-0 bg-white shadow-subtle"
    >
      {/*
       * The canvas is the picture and the text layer is the content, so the
       * text layer is what assistive technology and the browser's find-in-page
       * are pointed at. Labelling the canvas as well would read every page
       * twice.
       */}
      <canvas ref={canvasRef} className="block" aria-hidden="true" />
      <div ref={textLayerRef} className="textLayer" />
      {!isNear || !size ? (
        <div className="absolute inset-0 grid place-items-center text-xs text-ink-400">
          Page {pageNumber}
        </div>
      ) : null}
    </div>
  );
}

/* --------------------------------------------------------------- chrome */

function ReaderFrame({
  children,
  fill,
  className,
}: {
  children: ReactNode;
  fill?: boolean;
  className?: string;
}) {
  return (
    <figure
      className={cn(
        'overflow-hidden rounded-xl border border-border bg-surface',
        // A column so the toolbar keeps its natural height and the reading pane
        // takes whatever is left; `min-h-0` is what lets that pane shrink and
        // scroll rather than pushing the frame past its parent.
        fill && 'flex h-full min-h-0 flex-col',
        className,
      )}
    >
      {children}
    </figure>
  );
}

function Toolbar({
  currentPage,
  pageCount,
  zoom,
  canZoomIn,
  canZoomOut,
  isExpanded,
  canExpand,
  isLoading,
  fileName,
  downloadUrl,
  onGoToPage,
  onZoomIn,
  onZoomOut,
  onToggleExpanded,
}: {
  currentPage: number;
  pageCount: number;
  zoom: number;
  canZoomIn: boolean;
  canZoomOut: boolean;
  isExpanded: boolean;
  canExpand: boolean;
  isLoading: boolean;
  fileName: string;
  downloadUrl: string | null;
  onGoToPage: (page: number) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onToggleExpanded: () => void;
}) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-surface px-3 py-2">
      <p className="min-w-0 flex-1 truncate text-sm font-medium text-text-primary" title={fileName}>
        {fileName}
      </p>

      <div className="flex items-center gap-1">
        <ToolbarButton
          label="Previous page"
          disabled={isLoading || currentPage <= 1}
          onClick={() => onGoToPage(currentPage - 1)}
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
        </ToolbarButton>

        <span className="px-1 text-xs tabular-nums text-text-secondary" aria-live="polite">
          {isLoading ? '—' : `${currentPage} / ${pageCount}`}
        </span>

        <ToolbarButton
          label="Next page"
          disabled={isLoading || currentPage >= pageCount}
          onClick={() => onGoToPage(currentPage + 1)}
        >
          <ChevronRight className="size-4" aria-hidden="true" />
        </ToolbarButton>
      </div>

      <div className="flex items-center gap-1">
        <ToolbarButton label="Zoom out" disabled={isLoading || !canZoomOut} onClick={onZoomOut}>
          <ZoomOut className="size-4" aria-hidden="true" />
        </ToolbarButton>
        <span className="w-11 text-center text-xs tabular-nums text-text-secondary">
          {Math.round(zoom * 100)}%
        </span>
        <ToolbarButton label="Zoom in" disabled={isLoading || !canZoomIn} onClick={onZoomIn}>
          <ZoomIn className="size-4" aria-hidden="true" />
        </ToolbarButton>
      </div>

      {canExpand ? (
        <ToolbarButton
          label={isExpanded ? 'Shrink the reader' : 'Expand the reader'}
          onClick={onToggleExpanded}
        >
          {isExpanded ? (
            <Minimize2 className="size-4" aria-hidden="true" />
          ) : (
            <Maximize2 className="size-4" aria-hidden="true" />
          )}
        </ToolbarButton>
      ) : null}

      {downloadUrl ? (
        <a
          href={downloadUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Download the original PDF"
          className="grid size-8 place-items-center rounded-lg text-text-secondary transition-colors hover:bg-surface-sunken hover:text-primary"
        >
          <Download className="size-4" aria-hidden="true" />
        </a>
      ) : null}
    </div>
  );
}

function ToolbarButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        'grid size-8 place-items-center rounded-lg text-text-secondary transition-colors',
        'hover:bg-surface-sunken hover:text-primary',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus',
        'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent',
      )}
    >
      {children}
    </button>
  );
}

/**
 * Real progress, not a spinner: the response carries a length, so the reader
 * can be told how much of the document has arrived rather than only that
 * something is happening.
 */
function LoadingPane({
  progress,
  sizeBytes,
  className,
}: {
  progress: number | null;
  sizeBytes: number;
  className?: string;
}) {
  const percent = progress === null ? null : Math.round(progress * 100);

  return (
    <div className={cn('flex flex-col items-center gap-3 px-6 py-14', className)}>
      <div
        className="h-1 w-48 overflow-hidden rounded-full bg-surface-sunken"
        role="progressbar"
        aria-label="Loading the document"
        {...(percent === null
          ? {}
          : { 'aria-valuenow': percent, 'aria-valuemin': 0, 'aria-valuemax': 100 })}
      >
        <div
          className={cn(
            'h-full rounded-full bg-primary transition-[width] duration-200',
            percent === null && 'w-1/3 animate-pulse',
          )}
          style={percent === null ? undefined : { width: `${Math.max(4, percent)}%` }}
        />
      </div>
      <p className="text-xs text-text-muted">
        {percent === null
          ? 'Opening the document…'
          : `Loading ${percent}% of ${formatFileSize(sizeBytes)}`}
      </p>
    </div>
  );
}

/**
 * Failures a reader can act on. Anything else is reported plainly rather than
 * dressed up: the download link below it is the working alternative.
 */
function describeFailure(error: unknown): string {
  const name = (error as { name?: string } | null)?.name;

  if (name === 'PasswordException') {
    return 'This PDF is password protected, so it cannot be read here.';
  }
  if (name === 'InvalidPDFException') {
    return 'This file is not a readable PDF. It may have been damaged during upload.';
  }
  if (name === 'MissingPDFException' || name === 'UnexpectedResponseException') {
    return 'The document could not be loaded. It may have been removed, or in-browser reading may have been switched off.';
  }
  return 'The document could not be displayed.';
}
