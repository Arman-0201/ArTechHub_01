# Architecture

## Shape

Two deployable applications and three shared packages, in one npm workspace.

```
┌──────────────────┐         ┌──────────────────┐         ┌──────────────┐
│  Browser         │────────▶│  apps/web        │────────▶│  apps/api    │
│                  │◀────────│  Next.js 15      │◀────────│  Express     │
└──────────────────┘         │  (SSR + client)  │         │              │
         │                   └──────────────────┘         └──────┬───────┘
         │                                                       │
         └───────────────────────────────────────────────────────┤
                     direct browser → API calls                  │
                     (mutations, admin panel)                    ▼
                                                          ┌──────────────┐
                                                          │  PostgreSQL  │
                                                          │  + Storage   │
                                                          └──────────────┘
```

The browser talks to the API through two paths, deliberately:

- **Server-side** — page rendering. Next fetches from `API_INTERNAL_URL`,
  forwarding the request's cookies. Content arrives in the initial HTML, which
  is what makes the site fast and indexable.
- **Client-side** — mutations, the admin panel, progress updates. The browser
  calls `NEXT_PUBLIC_API_URL` directly.

The web app is **not** a backend-for-frontend. It never wraps or proxies the
API, so there is exactly one place where authorization is decided.

---

## Why this split

A single Next.js app with route handlers would have been fewer moving parts.
The API is separate because:

- **Authorization lives in one place.** Every rule is enforced in the Express
  layer. There is no second implementation in a route handler to drift.
- **The web app is replaceable.** A mobile client or a partner integration
  consumes the same API with the same guarantees.
- **They scale differently.** Rendering is CPU-bound and stateless; the API is
  IO-bound and holds the database pool.

The cost is an extra network hop on server render and the discipline of keeping
the contract explicit. `packages/types` is that contract.

---

## Backend (`apps/api`)

```
src/
├── config/env.ts          Environment parsing, validated at boot
├── lib/                   Cross-cutting: prisma, errors, crypto, jwt, cookies,
│                          storage, mailer, cache, sanitize, slug, http
├── middleware/            authenticate, validate, rate-limit, feature-gate,
│                          error-handler, context
├── modules/               One directory per domain
│   └── <domain>/
│       ├── *.service.ts       Business logic — the substance
│       ├── *.repository.ts    Data access, where the queries are non-trivial
│       ├── *.controller.ts    HTTP shape only
│       └── *.routes.ts        Wiring: limiter → validate → authorize → handler
├── routes/                Four routers, one per trust level
├── jobs/                  Background maintenance
└── app.ts / server.ts     Assembly and lifecycle
```

### The rule that shapes every module

Business logic lives in services. Routes and controllers stay thin.

A route is a declaration of what must be true before the handler runs:

```ts
adminRouter.patch(
  '/users/:id',
  requirePermissions(PERMISSIONS.USERS_UPDATE),   // authorization
  validateBody(adminUpdateUserSchema),            // validation
  asyncHandler(async (req, res) => {              // controller: HTTP only
    const user = await usersService.updateUser(   // service: the actual work
      req.params.id!, req.body, { id: req.user!.id, isSuperAdmin: req.user!.isSuperAdmin },
    );
    await recordAudit(req, { action: AUDIT_ACTIONS.USER_UPDATED, targetId: user.id });
    ok(res, user);
  }),
);
```

Reading a route file tells you the security posture of an endpoint without
opening the service.

### The four routers

| Router     | Mounted at        | Who                        | Gate                                     |
| ---------- | ----------------- | -------------------------- | ---------------------------------------- |
| `auth`     | `/api/v1/auth`    | anonymous                  | Per-endpoint rate limiters               |
| `public`   | `/api/v1/`        | anyone, optionally signed in | `optionalAuth` — personalises, never authorises |
| `account`  | `/api/v1/account` | a signed-in learner        | `authenticate`; subject is always the session |
| `admin`    | `/api/v1/admin`   | staff                      | `authenticate` + `requireAdminAccess` + per-route permission |

The `account` router has one invariant worth stating: every handler derives its
subject from `req.user.id`. No handler accepts a user id from the client. That
single rule is what makes it impossible to read another learner's data by
editing a request.

### Middleware order

Order in `app.ts` is load-bearing and reads as the path a request takes:

```
requestContext   assign a correlation id
helmet           security headers
cors             origin allowlist (not a reflector)
compression
body parsers     1MB ceiling
cookieParser
pino-http        structured logging with redaction
globalLimiter    broad flood ceiling
/health          before any gate, so orchestrators never see 503
/uploads         local media in development only
── /api/v1 ──
optionalAuth     identify, so maintenance mode can recognise staff
resolveLocale    negotiate the response language
maintenanceGate  block public traffic when maintenance is on
apiRouter
notFoundHandler
errorHandler     normalise every failure into one envelope
```

---

## Frontend (`apps/web`)

```
src/
├── app/
│   ├── layout.tsx              Document metadata only
│   ├── sitemap.ts, robots.ts
│   └── [locale]/
│       ├── layout.tsx          The real root: bootstrap, providers, chrome
│       ├── page.tsx            Home — rendered from the CMS
│       ├── courses/, learn/, categories/, blog/, instructors/, shop/, legal/
│       ├── (auth)/             Split-layout auth screens
│       ├── dashboard/          Learner area
│       ├── admin/              Admin panel
│       └── [slug]/             Catch-all for CMS pages
├── components/
│   ├── ui/                     Primitives
│   ├── layout/                 Header, footer, switchers
│   ├── sections/               CMS section registry
│   ├── content/                Rich-text renderer
│   ├── courses/, learn/, dashboard/, admin/, shop/, auth/
│   └── providers/              Site, auth, theme, query
└── lib/
    ├── api/                    server.ts, client.ts, queries.ts, hooks.ts
    ├── i18n/                   Locale config, dictionaries, translator
    ├── seo.ts, utils.ts, forms.ts, cart-store.ts
```

### Server or client

Server Components are the default. A component becomes a Client Component only
when it needs state, an effect, or an event handler. In practice:

- **Server** — all public pages, course and lesson pages, dashboard pages, the
  section renderer, the rich-text renderer, course cards.
- **Client** — the header (menus, search dialog), forms, the learning shell
  (progress), the entire admin panel, the cart.

The marketing pages ship almost no JavaScript. The admin panel ships a lot, and
that is the right trade in both places.

### Data fetching

| Where            | How                          | Why                                             |
| ---------------- | ---------------------------- | ----------------------------------------------- |
| Server Components | `lib/api/server.ts`          | Forwards cookies, `cache()`-deduplicated per render |
| Client mutations  | `lib/api/client.ts`          | Access token in memory, silent refresh, single-flight |
| Admin screens     | TanStack Query via `hooks.ts` | Genuinely client-owned state: filters, pagination |

Public pages do not use TanStack Query. Their data is fetched on the server and
passed down as props.

---

## The two rendering engines

Two registries turn stored data into UI. Both are closed by design — neither
can render something the code does not know about.

### Section registry

CMS pages are a list of typed sections. `registry.tsx` maps a section type to a
component; `PageRenderer` is a loop. An unknown type is skipped silently, which
matters during a rolling deploy when content may be authored against a newer
build than the one serving it.

There is no template language and no arbitrary markup path. The one HTML
section type is sanitised against an allowlist **on write**, so a payload never
survives long enough to reach a renderer.

### Rich-text renderer

Lesson and article bodies are a structured JSON tree, not HTML. The renderer
maps each node to a React element; text is rendered as text. `dangerouslySetInnerHTML`
appears exactly once in the entire web app — in the HTML section, for content
the server already sanitised.

This is also why the PDF importer works: it produces the same tree, so imported
content is editable with the same editor and rendered by the same component.

---

## Caching

| Layer                    | TTL      | Invalidated by            |
| ------------------------ | -------- | ------------------------- |
| Settings                 | 60s      | Settings save             |
| Feature flags            | 60s      | Flag toggle               |
| Languages                | 120s     | Language update           |
| Translations (per locale) | 120s    | Translation save          |
| Menus, footer            | 60s      | Menu or footer edit       |
| Legal links              | 120s     | Document publish          |

An in-process TTL cache with single-flight loading (`lib/cache.ts`), not Redis.
These are a handful of small values read on nearly every request, changed
rarely, and invalidated explicitly on save. The TTL is a safety net, not the
correctness mechanism. On a multi-instance deployment each instance can be at
most one TTL behind on configuration — acceptable for a menu label, and the
reason nothing security-relevant is cached this way.

Two denormalised counters exist for the same reason: `Course.lessonCount` and
`Course.enrollmentCount`, both maintained in the same transaction as the rows
they count. `CourseProgress` is a persisted aggregate of `LessonProgress`,
recomputed on every progress write.

---

## Internationalisation

Every URL carries its locale: `/en/courses`, `/hy/courses`. The prefix is
always present, including for the default locale — an implicit default creates
two URLs for the same content, which is an avoidable SEO problem.

Three layers resolve a string, most specific winning:

1. compiled dictionaries in `lib/i18n/dictionaries.ts` — always complete for `en`
2. the database catalogue an administrator edits at runtime
3. per-entity translation rows for content (courses, pages, menu labels)

Missing translations fall back through the locale chain (`en-GB` → `en`), so a
partially translated language never renders a raw key or an empty heading.

`en-GB` is modelled as a variant, not a separate language: it overrides only the
handful of strings that actually differ.

---

## Feature flags and maintenance mode

Flag *keys* are code-defined; their *state* is data. A key not in
`FEATURE_DEFINITIONS` is ignored even if a row exists, so a stale row can never
open a route that no longer expects to be gated.

Disabling a feature does three things: navigation links disappear (the API omits
them), public routes 404, and the API refuses the requests. The third is the
control; the first two are consequences.

Maintenance mode blocks public traffic while leaving three doors open — the
health check, the auth routes, and `/admin` — so an operator can always sign in
and turn it back off.

---

## Error handling

Every deliberate failure derives from `AppError` and carries a status, a machine
code and a safe message. Anything else that reaches the handler is logged in
full and reported as a bare `INTERNAL_ERROR`.

The response envelope is identical everywhere:

```json
{ "success": false,
  "error": { "code": "VALIDATION_ERROR", "message": "Validation failed",
             "fields": { "email": ["Already in use"] },
             "requestId": "b2c3…" } }
```

`requestId` is generated per request, returned in the `x-request-id` header, and
attached to every log line — so a user-reported failure maps to exactly one log
entry. Stack traces, Prisma messages and internal context never leave the
server.

---

## Extending it

**A new section type**: add it to `SECTION_TYPES` and the Prisma `SectionType`
enum, write the component, register it in `registry.tsx`, add a form branch in
`section-editor.tsx`.

**A new permission**: add it to `PERMISSIONS` and a `PERMISSION_GROUPS` entry,
apply `requirePermissions(...)` to the routes, re-run the seed. It appears in
the role editor automatically.

**A new locale**: add it to `LOCALES`, re-run the seed, activate it in the admin
panel. Optionally add a dictionary; anything missing falls back.

**A new OAuth provider**: add one entry to `oauth.providers.ts` with its
endpoints and a `fetchProfile`. Nothing else changes.

**A payment provider**: orders already carry provider-agnostic
`paymentProvider` / `paymentReference` columns and are created in
`AWAITING_PAYMENT`. Add an adapter that fills those in and advances the status.
