/** @type {import('next').NextConfig} */

/**
 * `NEXT_PUBLIC_API_URL` is baked into the client bundle *and* into the
 * `connect-src` directive of the CSP below — both at build time, neither
 * overridable afterwards. When it is missing from a deployed build the fallback
 * silently ships `connect-src 'self' http://localhost:4000`, so the browser
 * blocks every API call: a site that renders but has no data, diagnosable only
 * from the console. Refuse to produce that artefact.
 *
 * Only hosted builds are strict — a local `next build` against a dev API is a
 * legitimate thing to do.
 */
function resolveApiOrigin() {
  const raw = process.env.NEXT_PUBLIC_API_URL;
  const isHostedBuild = Boolean(process.env.VERCEL || process.env.CI);

  if (isHostedBuild && process.env.NODE_ENV === 'production') {
    if (!raw) {
      throw new Error(
        'NEXT_PUBLIC_API_URL is not set. Set it in the deployment environment ' +
          'before building: it is baked into the bundle and into the CSP, so it ' +
          'cannot be supplied at runtime.',
      );
    }
    if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::|\/|$)/i.test(raw)) {
      throw new Error(
        `NEXT_PUBLIC_API_URL points at a local address (${raw}) in a hosted ` +
          'production build. Set it to the public origin of the API.',
      );
    }
  }

  try {
    return new URL(raw ?? 'http://localhost:4000').origin;
  } catch {
    throw new Error(`NEXT_PUBLIC_API_URL is not a valid absolute URL: ${raw}`);
  }
}

const apiOrigin = resolveApiOrigin();

/**
 * The same origin as a WebSocket scheme, for `connect-src`.
 *
 * CSP Level 3 says an `https:` source expression also matches `wss:`, and
 * browsers implement it — but the rule is subtle enough that an explicit entry
 * is worth the twelve characters. The admin panel's live feed connects here.
 */
const apiWebSocketOrigin = apiOrigin.replace(/^http/, 'ws');

/**
 * Content Security Policy.
 *
 * The tight directives are the ones that matter: `object-src 'none'` and
 * `frame-ancestors 'none'` close plugin and clickjacking vectors outright,
 * and `connect-src` is limited to the API origin so injected script cannot
 * exfiltrate to an arbitrary host.
 *
 * `'unsafe-inline'` on styles is required by Next's inlined critical CSS.
 * In development `'unsafe-eval'` is additionally required by React Refresh;
 * it is deliberately absent from the production policy.
 */
function buildCsp() {
  const isDev = process.env.NODE_ENV !== 'production';

  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: https:",
    "media-src 'self' https:",
    `connect-src 'self' ${apiOrigin} ${apiWebSocketOrigin}${isDev ? ' ws: wss:' : ''}`,
    "frame-src 'self' https://www.youtube-nocookie.com https://player.vimeo.com",
    // pdf.js renders in a worker, bundled and served from this origin. `blob:`
    // covers its fallback path, which wraps the worker script in a blob URL
    // when the module worker cannot be constructed directly.
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ].join('; ');
}

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // Workspace packages ship TypeScript sources compiled to ESM; Next needs to
  // transpile them alongside the app.
  transpilePackages: ['@academy/types', '@academy/validation'],

  images: {
    remotePatterns: [
      { protocol: 'http', hostname: 'localhost' },
      { protocol: 'https', hostname: '**' },
    ],
    formats: ['image/avif', 'image/webp'],
  },

  experimental: {
    optimizePackageImports: ['lucide-react', 'framer-motion'],
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: buildCsp() },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
          ...(process.env.NODE_ENV === 'production'
            ? [
                {
                  key: 'Strict-Transport-Security',
                  value: 'max-age=31536000; includeSubDomains',
                },
              ]
            : []),
        ],
      },
    ];
  },
};

export default nextConfig;
