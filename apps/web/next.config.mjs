/** @type {import('next').NextConfig} */

const apiOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').origin;
  } catch {
    return 'http://localhost:4000';
  }
})();

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
    `connect-src 'self' ${apiOrigin}${isDev ? ' ws: wss:' : ''}`,
    "frame-src 'self' https://www.youtube-nocookie.com https://player.vimeo.com",
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
