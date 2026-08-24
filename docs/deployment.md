# Deployment

Target topology: the Next.js app on Vercel, the Express API on Render, PostgreSQL
on Neon or Supabase, uploads on S3-compatible object storage.

## Why a custom domain is not optional

Server-side rendering reads the session from the incoming request's cookies and
forwards them to the API (`apps/web/src/lib/api/server.ts`). The refresh cookie
is set by the API, on the API's host. So the web app and the API must share a
parent domain, or the Next server never receives the cookie: `getSessionUser()`
returns null, and `DashboardLayout` and the admin shell redirect every signed-in
visitor back to the login screen. Browsers that block third-party cookies
(Safari, Firefox) additionally break the browser-side refresh.

`*.vercel.app` and `*.onrender.com` share no parent domain, so that pairing
cannot work. Use one domain with two hosts:

| Role | Host |
| ---- | ---- |
| Web app | `example.com` |
| API | `api.example.com` |
| `COOKIE_DOMAIN` | `.example.com` |

## Order of operations

The sequence is constrained by two facts: `NEXT_PUBLIC_*` values are compiled
into the web bundle and into the CSP header, so they must be correct *before*
the web build; and the API needs the web origin in `CORS_ORIGINS`. Fixing the
domains first (step 1) removes the circular dependency.

### 1. Provision

- A domain, with DNS you can edit.
- PostgreSQL. Keep both connection strings: the pooled one for `DATABASE_URL`
  and the direct one for `DIRECT_URL`. `DIRECT_URL` is required — the Prisma
  schema declares it, and an empty value reads as missing.
- An S3-compatible bucket (Cloudflare R2, Supabase Storage, Backblaze B2).
  Render's disk is ephemeral, so `STORAGE_DRIVER=local` loses every upload on
  redeploy.
- An SMTP sender (Resend, Brevo, Mailgun). The API refuses to boot in production
  with `MAIL_TRANSPORT=console`, and now also with `smtp` and no `SMTP_HOST`.

### 2. Migrate and seed, from a workstation

Render's free plan has no shell, and the seed must not run on every boot: it
replaces page sections and menu items, which would discard the CMS edits an
admin has made. Run it once, locally, against the production database.

Put the production values in `apps/api/.env` temporarily, then:

```bash
npm run db:generate
npm run db:deploy --workspace @academy/api
npm run db:seed   --workspace @academy/api
```

Set real `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` first — the defaults are
published in `.env.example`. Remove the production values from the local `.env`
afterwards.

The seed is what makes the site non-empty: permissions, roles, the owner
account, languages, translations, feature flags, settings, navigation, and the
system pages all come from it.

### 3. API on Render

New → Blueprint → this repository. `render.yaml` declares everything; fill in
the values marked `sync: false`:

| Variable | Value |
| -------- | ----- |
| `API_PUBLIC_URL` | `https://api.example.com` |
| `WEB_PUBLIC_URL` | `https://example.com` |
| `CORS_ORIGINS` | `https://example.com` |
| `COOKIE_DOMAIN` | `.example.com` (leading dot) |
| `DATABASE_URL` / `DIRECT_URL` | from step 1 |
| `JWT_ACCESS_SECRET`<br>`JWT_REFRESH_SECRET`<br>`TOKEN_PEPPER_SECRET` | three *different* values, 32+ chars |
| `MAIL_FROM`, `SMTP_*` | from step 1 |
| `S3_*` | from step 1 |
| `SEED_ADMIN_*` | same as step 2 |

Generate each secret separately:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

`config/env.ts` rejects placeholder values, reused secrets, `COOKIE_SECURE=false`,
an empty `CORS_ORIGINS`, `MAIL_TRANSPORT=console`, `smtp` without a host, and
`STORAGE_DRIVER=s3` without credentials — all at boot, before serving traffic.

Then add `api.example.com` as a custom domain, wait for the certificate, and
confirm both endpoints before touching Vercel — the web app renders every page
on demand and needs the API at build time too:

```bash
curl https://api.example.com/health
curl https://api.example.com/health/ready   # also checks the database
```

### 4. Web on Vercel

Import the repository, then in Settings:

- **Root Directory**: `apps/web`. Without it the build fails with
  "No Next.js version detected" — Vercel reads the Next version from the
  package.json in the root directory, and the repository root has no `next`
  dependency. `apps/web/vercel.json` supplies the install and build commands,
  both of which step up to the workspace root. Leaving Root Directory at the
  repository root makes Vercel run the root `npm run build`, which also compiles
  the API; that fails with a wall of `Namespace 'Prisma' has no exported member`
  errors because Vercel blocks install scripts, so `@prisma/client`'s postinstall
  never generates the client.

Set the environment variables **before the first build**:

| Variable | Value |
| -------- | ----- |
| `NEXT_PUBLIC_API_URL` | `https://api.example.com` |
| `NEXT_PUBLIC_SITE_URL` | `https://example.com` |
| `API_INTERNAL_URL` | `https://api.example.com` |

`next.config.mjs` fails the build if `NEXT_PUBLIC_API_URL` is missing or points
at a local address on a hosted build, rather than shipping a bundle whose CSP
blocks every API call.

Then add `example.com` (and a `www` redirect) as custom domains.

### 5. OAuth, if used

Register these callbacks with the provider, then set `GOOGLE_CLIENT_ID` /
`GOOGLE_CLIENT_SECRET` / `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` on Render
and redeploy. A provider left blank is simply disabled.

```
https://api.example.com/api/v1/auth/oauth/google/callback
https://api.example.com/api/v1/auth/oauth/github/callback
```

### 6. Verify

1. `GET /health/ready` returns `{"status":"ready"}`.
2. The home page renders seeded content and navigation.
3. No CSP violations in the browser console, and API calls return 200.
4. Sign in as the owner: `/en/dashboard` renders instead of bouncing to
   `/login`. This is the check that the cookie domain is right.
5. `/en/admin` renders.
6. Admin → Media → upload a file; it loads from the S3 public URL.
7. Register a new address; the verification email arrives.
8. Repeat 4 in Safari, which is strictest about cross-site cookies.

## Notes

- Render's free plan sleeps after 15 minutes idle, and every page in this app is
  rendered on demand — only `/robots.txt` and `/_not-found` are prerendered. The
  first visit after an idle period therefore waits on a cold API start, around
  50 seconds, and may time out. The Starter plan removes the sleep.
- `npm ci` must be run with `--include=dev` wherever `NODE_ENV=production` is
  set, or npm defaults to `omit=dev` and strips the Prisma CLI, TypeScript and
  tsx — leaving nothing to build or seed with. Both `render.yaml` and
  `apps/web/vercel.json` pass it.
