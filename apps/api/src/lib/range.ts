import type { Request, Response } from 'express';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { logger } from './logger.js';

/**
 * Byte-range responses.
 *
 * The in-browser PDF reader is the reason this exists. pdf.js asks for the
 * first and last few kilobytes of a document, reads the cross-reference table,
 * then pulls the pages the reader is actually looking at. That is what makes a
 * large document open instantly instead of after a full download — but it only
 * works if the server honours `Range`. Answering 200 with the whole file to
 * every one of those requests would be slower than not ranging at all.
 */

export interface RangeStreamOptions {
  sizeBytes: number;
  mimeType: string;
  fileName: string;
  /** Opens the requested slice. Called once, after the range is validated. */
  open: (range: { start: number; end: number } | undefined) => Promise<Readable>;
}

/**
 * A single `bytes=` range, or null for "serve the whole thing".
 *
 * Multi-range requests are answered with the full body rather than a
 * `multipart/byteranges` response: no client this serves sends one, and a
 * half-correct multipart implementation is worse than not advertising support.
 * Returning `unsatisfiable` is distinct from returning null — the first must
 * answer 416, the second 200.
 */
export function parseRange(
  header: string | undefined,
  sizeBytes: number,
): { start: number; end: number } | null | 'unsatisfiable' {
  if (!header) return null;

  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;

  const [, rawStart, rawEnd] = match;
  if (!rawStart && !rawEnd) return null;

  let start: number;
  let end: number;

  if (!rawStart) {
    // `bytes=-500` — the final 500 bytes, which is how pdf.js finds the trailer.
    const suffixLength = Number(rawEnd);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return 'unsatisfiable';
    start = Math.max(0, sizeBytes - suffixLength);
    end = sizeBytes - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd ? Number(rawEnd) : sizeBytes - 1;
  }

  if (!Number.isFinite(start) || !Number.isFinite(end)) return 'unsatisfiable';
  if (start >= sizeBytes || start < 0) return 'unsatisfiable';
  // A range that overruns the file is clamped, not rejected: RFC 9110 says the
  // last byte position is the smaller of the two.
  end = Math.min(end, sizeBytes - 1);
  if (end < start) return 'unsatisfiable';

  return { start, end };
}

/** RFC 6266 — an ASCII fallback plus the real, percent-encoded UTF-8 name. */
function contentDisposition(fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

/**
 * Streams a stored object, honouring `Range`.
 *
 * Never buffers: on an aborted request — a learner closing the tab mid-download
 * is the normal case, not the exception — the source stream is destroyed so the
 * read does not carry on against a socket nobody is listening to.
 */
export async function sendRangeStream(
  req: Request,
  res: Response,
  options: RangeStreamOptions,
): Promise<void> {
  const { sizeBytes, mimeType, fileName } = options;

  res.setHeader('Content-Type', mimeType);
  res.setHeader('Content-Disposition', contentDisposition(fileName));
  res.setHeader('Accept-Ranges', 'bytes');
  // Per-viewer, access-controlled bytes: a shared cache must never hold them,
  // and `no-store` keeps them out of the browser's disk cache too.
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Overrides the API-wide policy for this response. It only takes effect if a
  // browser treats the bytes as a document, which is exactly the case worth
  // neutering for user-uploaded content.
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");

  const range = parseRange(req.headers.range, sizeBytes);

  if (range === 'unsatisfiable') {
    res.status(416).setHeader('Content-Range', `bytes */${sizeBytes}`);
    res.end();
    return;
  }

  if (range) {
    res.status(206);
    res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${sizeBytes}`);
    res.setHeader('Content-Length', String(range.end - range.start + 1));
  } else {
    res.status(200);
    res.setHeader('Content-Length', String(sizeBytes));
  }

  if (req.method === 'HEAD') {
    res.end();
    return;
  }

  const source = await options.open(range ?? undefined);

  try {
    await pipeline(source, res);
  } catch (error) {
    source.destroy();
    // Headers are already sent, so there is no error response to give. An
    // aborted request is routine and not worth a log line; anything else is.
    if (!isAbort(error)) {
      logger.error({ err: error, fileName }, 'Failed while streaming a stored object');
    }
    if (!res.writableEnded) res.destroy();
  }
}

function isAbort(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === 'ERR_STREAM_PREMATURE_CLOSE' || code === 'ECONNRESET' || code === 'EPIPE';
}
