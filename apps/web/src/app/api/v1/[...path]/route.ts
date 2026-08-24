import { NextResponse, type NextRequest } from 'next/server';

/**
 * Same-origin proxy to the API.
 *
 * The browser talks to `/api/v1/*` on this app's own origin and this handler
 * forwards to the API. That exists for one reason: cookies.
 *
 * The refresh cookie is set by the API, on the API's host. When the web app and
 * the API sit on unrelated hosts — `*.vercel.app` and `*.onrender.com` share no
 * parent domain, so no `COOKIE_DOMAIN` can cover both — the cookie is never sent
 * to the Next server. `getSessionUser()` then returns null on every server
 * render and the dashboard and admin shells bounce a signed-in visitor straight
 * back to the login screen: sign-in appears to work, the next navigation
 * undoes it.
 *
 * Routing the browser's calls through here makes the cookie first-party: it is
 * stored against the web origin, so it rides along on ordinary page requests and
 * server rendering sees the same session the browser does. Two problems
 * disappear with it — CORS (a server-to-server request carries no `Origin`, so
 * the API's allowlist is never consulted) and third-party cookie blocking in
 * Safari and Firefox.
 *
 * A shared parent domain (`example.com` + `api.example.com`) is still the better
 * topology — it saves this hop. This handler is what makes the hostnames a
 * platform hands out work without one.
 */

const UPSTREAM = (
  process.env.API_INTERNAL_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:4000'
).replace(/\/+$/, '');

/**
 * Headers that describe the hop rather than the message. Forwarding them
 * corrupts either the upstream request or the response the browser parses:
 * `host` would defeat virtual hosting, `content-length` stops matching once a
 * body is re-encoded, and `accept-encoding` would invite a compressed body that
 * `fetch` transparently decodes — leaving a `content-encoding` header that no
 * longer describes the bytes.
 */
const STRIP_FROM_REQUEST = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length',
  'accept-encoding',
  // Deliberate: the API's CORS allowlist rejects an unknown `Origin` outright,
  // and a proxied call is server-to-server. Sending the browser's origin would
  // turn every request into the very CORS failure this proxy removes.
  'origin',
  'referer',
  // Replaced below with a single, known-length value.
  'x-forwarded-for',
  'x-real-ip',
]);

const STRIP_FROM_RESPONSE = new Set([
  'connection',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
  'content-encoding',
  'content-length',
  'set-cookie',
]);

/**
 * Rebinds a cookie from the API's host to this one.
 *
 * `Domain` always goes: the attribute names the API's host, which the browser
 * would reject as a mismatch for this origin. Dropping it yields a host-only
 * cookie for the web app, which is what we want.
 *
 * Over plain HTTP — local development against `next dev` — `Secure` has to go
 * too, or the browser discards the cookie silently, and `SameSite=None` must
 * come down to `Lax`, since `None` without `Secure` is rejected outright. Both
 * attributes survive untouched on HTTPS.
 */
function rebindCookie(value: string, isSecureContext: boolean): string {
  const attributes = value.split(';').filter((part) => {
    const name = part.trim().split('=')[0]?.toLowerCase();
    if (name === 'domain') return false;
    if (name === 'secure' && !isSecureContext) return false;
    return true;
  });

  if (isSecureContext) return attributes.join(';');

  return attributes
    .map((part) => (/^\s*samesite\s*=\s*none\s*$/i.test(part) ? ' SameSite=Lax' : part))
    .join(';');
}

/**
 * The visitor's address, as this platform reported it.
 *
 * Forwarded on deliberately, and as exactly one entry: every rate limit in the
 * API keys on `req.ip`, which Express derives by counting hops back through
 * `X-Forwarded-For`. Passing the header through untouched would make that count
 * depend on how many entries the platform happened to prepend; rewriting it to a
 * single address fixes the chain at two hops — this proxy, then the API's load
 * balancer — which is what `TRUST_PROXY` names. Without it every visitor shares
 * one bucket keyed on this proxy's address.
 */
function clientAddress(request: NextRequest): string | null {
  const forwarded = request.headers.get('x-forwarded-for');
  const first = forwarded?.split(',')[0]?.trim();
  if (first) return first;

  const real = request.headers.get('x-real-ip')?.trim();
  return real && real.length > 0 ? real : null;
}

function isSecureRequest(request: NextRequest): boolean {
  const forwarded = request.headers.get('x-forwarded-proto');
  if (forwarded) return forwarded.split(',')[0]?.trim() === 'https';
  return request.nextUrl.protocol === 'https:';
}

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const target = `${UPSTREAM}/api/v1/${path.map(encodeURIComponent).join('/')}${request.nextUrl.search}`;

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (!STRIP_FROM_REQUEST.has(key.toLowerCase())) headers.set(key, value);
  });

  const client = clientAddress(request);
  if (client) headers.set('x-forwarded-for', client);

  // Buffered rather than streamed: a streaming request body needs
  // `duplex: 'half'`, which not every runtime this may be deployed to supports.
  // Uploads are capped well below the platform request limit, so the cost is a
  // short-lived allocation.
  let body: ArrayBuffer | undefined;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const buffer = await request.arrayBuffer();
    if (buffer.byteLength > 0) body = buffer;
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      ...(body ? { body } : {}),
      redirect: 'manual',
      cache: 'no-store',
    });
  } catch {
    // Matches what the server-side client reports for the same failure, so a
    // dead API looks identical whichever path reached it.
    return NextResponse.json(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'The service is temporarily unreachable.' },
      },
      { status: 503 },
    );
  }

  const responseHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!STRIP_FROM_RESPONSE.has(key.toLowerCase())) responseHeaders.set(key, value);
  });

  const secure = isSecureRequest(request);
  for (const cookie of upstream.headers.getSetCookie()) {
    responseHeaders.append('set-cookie', rebindCookie(cookie, secure));
  }

  return new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

// Every response is per-request: it carries the caller's session.
export const dynamic = 'force-dynamic';

export {
  proxy as GET,
  proxy as POST,
  proxy as PUT,
  proxy as PATCH,
  proxy as DELETE,
  proxy as HEAD,
  proxy as OPTIONS,
};
