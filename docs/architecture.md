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

## Live data

Every tab holds one WebSocket — a visitor reading a marketing page, a learner in
a lesson, an editor in the panel — and what it receives is decided once, at the
handshake, by the credential it presented.

```
admin publishes a course
  -> admin route handler                    (validates, writes, audits)
  -> recordAudit()                          (one hook, every module)
  -> broadcastChange({resources:[...]})     -> admin sockets, narrowed by permission
  -> broadcastPublic(['catalog'])           -> every socket, including anonymous
  -> each browser re-reads through the endpoint it always used

admin grants an enrollment
  -> enroll()
  -> broadcastToUser(learnerId, ['enrollments','progress'])
  -> that learner's tabs only
```

### The three audiences

| Audience  | Who                        | Carries                                   |
| --------- | -------------------------- | ----------------------------------------- |
| `public`  | everyone, anonymous included | a channel name and a timestamp — no ids, no actor |
| `learner` | any signed-in account      | which of *its own* areas moved            |
| `admin`   | an account with an admin permission | resources, action, target, actor — narrowed per permission |

They are cumulative: a signed-in visitor is `public` + `learner`, an editor adds
`admin` on top. A socket is never told about an audience it does not hold, which
is what makes it safe to hand the same endpoint to a stranger.

The public channels are coarse on purpose, and that coarseness is the security
property. An admin is told "course `abc` was updated by Dana"; a visitor is told
"the catalogue moved" and goes to look — through the public API, which serves
published content and nothing else. A draft edited into existence and back out
again is invisible either way. Actions that reveal only internal activity —
a role changed, a media file uploaded, an order's status moved — produce no
public event at all, which is both the privacy answer and the efficient one:
waking every open page for a change nobody can see is pure waste.

Five decisions carry the design.

**The audit trail is the source — for two of the three.** Every deliberate
administrative change already passes through `recordAudit`, so hooking it there
means no module has to remember to notify anyone, and an action worth recording
is exactly an action others want to see. `realtime/events.ts` maps the action
prefix twice over: to the admin screens it moves (`lesson.updated` moves the
course list, and every action also moves the audit log and the dashboard) and to
the public channel a visitor might be looking at. Deriving both in one place is
what stops them drifting, or an actor's name being copied into the public one.

**Learner events are announced explicitly.** They cannot come from the audit
trail, because an audit entry records who *acted* and this needs to know who was
*affected* — and the two differ in exactly the cases that matter: an
administrator granting an enrollment, an order clearing. So `enroll()`,
`updateLessonProgress()` and `updateOrderStatus()` name the learner themselves.
The same mechanism gives multi-tab consistency for free: completing a lesson in
one window moves the dashboard in another, because the writer's own tabs hear it
too.

**Events name, they do not carry.** A change notice says which resources went
stale; the client refetches through the endpoint it always used. The socket can
therefore never become a second read path that skips a permission check, and a
screen with no live feed behaves exactly as it did before. The resource list is
narrowed per subscriber, so an editor without `users.read` is never told a user
changed.

**The socket is bound to its token.** It authenticates once, at the handshake,
using the same resolver an HTTP request uses — permissions read from the
database, not from the token. It then closes when that token expires, so
revoking a role cannot leave a live feed running until the tab closes.

**The registry is in-process.** With more than one API instance, a change made
on instance A does not reach a client connected to instance B, and those pages
fall back to refreshing on navigation as before. Scaling out means publishing the
three broadcast functions over Redis pub/sub and subscribing on each instance; no
call site changes. This is the same trade-off the in-memory rate limiter makes —
but it now bounds concurrent *visitors* rather than concurrent administrators,
which is a much lower ceiling. `REALTIME_PUBLIC_ENABLED=false` is the escape
hatch: it drops the anonymous half and leaves the public site exactly as it
behaved before the feed existed. `REALTIME_MAX_ANONYMOUS` caps the rest.

On the browser side, `RealtimeProvider` is mounted once in `Providers`, so one
socket serves the whole tab — marketing page, dashboard and admin panel alike.
It invalidates TanStack Query keys by prefix (the same mechanism
`useApiMutation` uses after a write) and calls `router.refresh()` for the
screens that are Server Components, which is most of them.

**Refreshes are paced by who is waiting.** A learner just acted and is looking
at the result, so theirs fires in 400ms. An admin is watching someone else work:
two seconds. A public visitor is not waiting at all — the page they are reading
is still correct — so a public refresh is delayed three seconds *and given up to
seven more at random*. Without that jitter, one editorial click would have every
connected visitor demand a fresh server render in the same instant, which is the
failure mode that makes live updates worse than none. A hidden tab refreshes
nothing until it is looked at again.

---

## Reading PDFs in place

A lesson imported from a PDF keeps the original. Two different things can be
done with it, and the platform does both.

**Import** (`content/pdf-import.service.ts`) converts the document to rich text
once, at admin time, so the lesson reads like the rest of the site.

**Reading** streams the original to a pdf.js reader in the lesson page. The
chain is short and every link is deliberate:

| Piece | Why it is there |
| ----- | --------------- |
| `lib/storage.ts` `openObjectStream` | A slice, as a stream. Buffering a 60MB textbook per reader is how an API runs out of memory |
| `lib/range.ts` | Parses `Range`, answers 206/416, streams without buffering |
| `requireFeature(PDF_READER)` | The admin panel can withdraw in-browser reading platform-wide |
| `getLessonPdfSource` | The same access check as the lesson body, not a lighter one |
| The web proxy | Keeps the request same-origin, so the session cookie authorises it and no token has to be threaded into pdf.js |

pdf.js reads the trailer with a suffix range, then pulls only the pages being
looked at. That is why a large document opens as fast as a small one — and why
the endpoint has a rate limit of its own: one open document is one logical read
spread over dozens of requests, which would otherwise exhaust the global
allowance for everything else the same visitor does.

### The same reader on a CMS page

A `PDF_GALLERY` section publishes documents on any CMS page: a responsive grid
of covers that opens the same `PdfReader` in an overlay. The reader is shared
verbatim — it takes a URL, a name and a size, and does not know or care which
route produced them.

What differs is the route and what it will serve. `GET /documents/:id` needs no
session, because an editor put the document on a public page; in exchange it
refuses anything that is not a PDF, and anything attached to a lesson, so a
document behind a course's access check cannot be republished by id.

Covers are rendered **in the editor's browser**, at the moment a document is
added: pdf.js draws page one to a canvas and the JPEG is uploaded as ordinary
media. That keeps a marketing page showing thirty documents at thirty `<img>`
tags rather than thirty copies of pdf.js, and leaves the server with no
rasteriser to install. A document whose cover will not render still publishes,
against a deterministic placeholder — the same treatment a course with no
artwork gets.

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

`PDF_READER_ENABLED` is a worked example of the pattern. Off, the stream route
404s, the lesson payload stops describing a readable PDF, and the reader is
never rendered — while `sourcePdfUrl` keeps working, so the document is still
downloadable. Withdrawing a way of reading is not the same as withdrawing the
content, and the flag is scoped to the first.

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
