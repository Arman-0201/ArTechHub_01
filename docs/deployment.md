# Deployment

Target topology: the Next.js app on Vercel, the Express API on Render, PostgreSQL
on Neon or Supabase, uploads on S3-compatible object storage.

## The browser never calls the API directly

Server-side rendering reads the session from the incoming request's cookies and
forwards them to the API (`apps/web/src/lib/api/server.ts`). The refresh cookie
is set by the API, on the API's host — so when the two live on unrelated hosts
the Next server never receives it: `getSessionUser()` returns null, and
`DashboardLayout` and the admin shell redirect every signed-in visitor back to
the login screen. Signing in appears to work and the next navigation undoes it.

So the browser talks to `/api/v1/*` on the web app's own origin, and
`apps/web/src/app/api/v1/[...path]/route.ts` forwards each request to the API,
rewriting `Set-Cookie` to drop the `Domain` attribute. The cookie binds to the
web host instead: server rendering sees the same session the browser does, CORS
never applies (a server-to-server request carries no `Origin`), and the
third-party cookie blocking in Safari and Firefox stops mattering.

That makes the hostnames the platforms hand out — `*.vercel.app` paired with
`*.onrender.com` — a working deployment, with one hop of overhead per API call.
A shared parent domain is still the better topology, and OAuth needs it: the
provider's callback lands on the API host directly, bypassing the proxy.

**Two calls do not take that hop: the realtime socket and file uploads.**

- The socket, because a Next route handler answers requests and cannot hand over
  an HTTP upgrade. The browser opens `wss://<api host>/api/v1/realtime` itself.
- Uploads, because the proxy is a serverless function on most hosts and a
  function has a request-body ceiling of its own — 4.5MB on Vercel, well under
  `MAX_UPLOAD_MB`. The platform refuses the request before any application code
  runs, so a larger lesson PDF fails with a response that is not even the API's
  error envelope. Uploads authenticate with the bearer token rather than the
  refresh cookie, which is what makes going direct safe.

Both consequences for a deployment, and they apply to both calls:

- `NEXT_PUBLIC_API_URL` must be the API's real public origin — the socket URL and
  the upload URL are built from it, and it is baked in at build time.
- `CORS_ORIGINS` must list the web origin. Both requests carry an `Origin`,
  unlike the proxied ones, and both are refused without it.

If the socket cannot connect, the admin panel says so in its sidebar and keeps
working — screens refetch on navigation, as they did before the feed existed.

One more consequence, on the API side: `TRUST_PROXY` counts the hops on the
*HTTP* path, which includes the web app's origin. A socket skips that hop, so
the handshake sees one fewer entry in `X-Forwarded-For`; `realtime/hub.ts`
clamps for it rather than falling back to the load balancer's own address, which
would put every visitor in one bucket and refuse everyone past the per-address
socket cap.

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
4. Sign in as the owner, then navigate to `/en/dashboard`: it renders instead
   of bouncing to `/login`. This is the check that the session cookie reached
   the Next server.
5. `/en/admin` renders, and its sidebar reads **Live** rather than *Offline*.
   Offline means the WebSocket could not reach the API: check
   `NEXT_PUBLIC_API_URL` and that `CORS_ORIGINS` lists the web origin.
6. Admin → Features → toggle something with the panel open in a second browser;
   the second one updates without a reload.
7. Admin → Media → upload a file *over 5MB*; it succeeds and loads from the S3
   public URL. Anything smaller would also pass through the proxy, so it does
   not test that the direct upload path is configured.
8. Register a new address; the verification email arrives.
9. Repeat 4 in Safari, which is strictest about cross-site cookies.

## Notes

- Render's free plan sleeps after 15 minutes idle, and every page in this app is
  rendered on demand — only `/robots.txt` and `/_not-found` are prerendered. The
  first visit after an idle period therefore waits on a cold API start, around
  50 seconds, and may time out. The Starter plan removes the sleep.
- `npm ci` must be run with `--include=dev` wherever `NODE_ENV=production` is
  set, or npm defaults to `omit=dev` and strips the Prisma CLI, TypeScript and
  tsx — leaving nothing to build or seed with. Both `render.yaml` and
  `apps/web/vercel.json` pass it.
- The realtime hub is in-process. Running more than one API instance means an
  admin connected to instance A is not told about a change made on instance B —
  the same trade-off the in-memory rate limiter makes. Scaling out means
  publishing `broadcastChange` over Redis pub/sub; see
  [architecture.md](architecture.md#live-admin-data). Nothing breaks in the
  meantime; those screens simply refresh on navigation.
- A proxy or load balancer in front of the API must forward WebSocket upgrades
  and should allow an idle connection to live past its default timeout. The
  30-second heartbeat keeps the socket busy enough for most defaults, and the
  client reconnects with backoff regardless.
