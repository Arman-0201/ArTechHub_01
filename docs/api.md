# API reference

Base URL: `{API_PUBLIC_URL}/api/v1`

---

## Conventions

### Response envelope

Every response uses the same shape, so a client has one thing to unwrap.

**Success**

```json
{ "success": true, "data": { … } }
```

**Success with pagination**

```json
{
  "success": true,
  "data": [ … ],
  "meta": {
    "page": 1, "pageSize": 20, "total": 137, "totalPages": 7,
    "hasNextPage": true, "hasPreviousPage": false
  }
}
```

**Failure**

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "fields": { "email": ["Already in use"] },
    "requestId": "b2c3d4e5-…"
  }
}
```

`fields` appears only on validation errors and is keyed by dotted path, so a
form can map errors straight onto its inputs. `requestId` is echoed in the
`x-request-id` header and appears in every server log line for that request.

### Error codes

| Code                     | Status | Meaning                                        |
| ------------------------ | ------ | ---------------------------------------------- |
| `VALIDATION_ERROR`       | 422    | Input failed schema validation                 |
| `BAD_REQUEST`            | 400    | Malformed or semantically invalid request      |
| `AUTHENTICATION_ERROR`   | 401    | Missing, expired or invalid credentials        |
| `AUTHORIZATION_ERROR`    | 403    | Authenticated, but not permitted               |
| `NOT_FOUND`              | 404    | No such resource (or not visible to you)       |
| `CONFLICT`               | 409    | Uniqueness or state conflict                   |
| `PAYLOAD_TOO_LARGE`      | 413    | Upload exceeds the limit                       |
| `UNSUPPORTED_MEDIA_TYPE` | 415    | File type not allowed                          |
| `RATE_LIMITED`           | 429    | Too many requests                              |
| `FEATURE_DISABLED`       | 404    | Feature switched off — reported as not found   |
| `MAINTENANCE_MODE`       | 503    | Maintenance mode is on                         |
| `INTERNAL_ERROR`         | 500    | Unexpected failure; details are in the log only |

`FEATURE_DISABLED` answers 404 rather than 403 so a probe cannot distinguish
"exists but off" from "does not exist".

### Authentication

Send the access token as a bearer header:

```
Authorization: Bearer <accessToken>
```

The refresh token is an HttpOnly cookie handled by the browser. It never appears
in a response body. To obtain an access token on page load, call
`POST /auth/refresh` with credentials included.

**Cookie authentication for reads.** `GET` and `HEAD` requests may authenticate
with the refresh cookie instead of a bearer token. This exists so a server-side
renderer — which holds cookies but not the in-memory access token — can render
authenticated pages. Writes are bearer-only; see
[security.md](security.md#two-credentials-deliberately-asymmetric).

### Common parameters

| Parameter  | Type   | Default | Notes                                    |
| ---------- | ------ | ------- | ---------------------------------------- |
| `page`     | int    | 1       |                                          |
| `pageSize` | int    | 20      | Maximum 100                              |
| `search`   | string | —       | Case-insensitive                         |
| `sort`     | string | varies  | Checked against a per-resource allowlist |
| `order`    | enum   | `desc`  | `asc` or `desc`                          |
| `locale`   | string | negotiated | Also accepted as the `X-Locale` header |

---

## Authentication — `/auth`

| Method | Path                        | Auth | Description                                     |
| ------ | --------------------------- | ---- | ----------------------------------------------- |
| POST   | `/auth/register`            | —    | Create an account; returns a session            |
| POST   | `/auth/login`               | —    | Sign in                                         |
| POST   | `/auth/refresh`             | cookie | Rotate the refresh token, issue an access token |
| POST   | `/auth/logout`              | —    | Revoke this device's session family             |
| POST   | `/auth/logout-all`          | ✓    | Revoke every session and bump the token version |
| GET    | `/auth/me`                  | ✓    | The current user with roles and permissions     |
| GET    | `/auth/session`             | cookie | Current user or `null`; read-only, no rotation |
| POST   | `/auth/verify-email`        | —    | Consume an email verification token             |
| POST   | `/auth/resend-verification` | —    | Request a new verification link                 |
| POST   | `/auth/forgot-password`     | —    | Request a reset link                            |
| POST   | `/auth/reset-password`      | —    | Consume a reset token and set a new password    |
| POST   | `/auth/change-password`     | ✓    | Change password; revokes all sessions           |
| POST   | `/auth/otp/request`         | —    | Email a six-digit code                          |
| POST   | `/auth/otp/verify`          | —    | Exchange a code for a session                   |
| GET    | `/auth/oauth/providers`     | —    | Configured and enabled providers                |
| GET    | `/auth/oauth/:provider/start` | —  | Begin the authorization-code flow               |
| GET    | `/auth/oauth/:provider/callback` | — | Provider redirect target                      |

`register`, `login`, `refresh` and `otp/verify` set the refresh cookie and
return `{ accessToken, accessTokenExpiresAt, user }`.

Endpoints that could reveal whether an account exists — `forgot-password`,
`resend-verification`, `otp/request` — always return the same success message.

**Example**

```http
POST /api/v1/auth/login
Content-Type: application/json

{ "email": "learner@example.com", "password": "Str0ngPassword" }
```

```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs…",
    "accessTokenExpiresAt": "2026-08-21T12:15:00.000Z",
    "user": {
      "id": "clx…", "email": "learner@example.com", "name": "Ada Lovelace",
      "status": "ACTIVE", "emailVerified": true, "locale": "en",
      "roles": [{ "id": "clx…", "slug": "student", "name": "Student" }],
      "permissions": [], "isSuperAdmin": false, "canAccessAdmin": false
    }
  }
}
```

---

## Public — `/`

Readable by anyone. Personalised when a session is present, but never
authorised by it.

### Site

| Method | Path                          | Description                                    |
| ------ | ----------------------------- | ---------------------------------------------- |
| GET    | `/site/bootstrap`             | Settings, languages, features, menus, footer, legal links |
| GET    | `/site/languages`             | Active languages                               |
| GET    | `/site/translations/:locale`  | UI strings, resolved through the fallback chain |
| GET    | `/site/features`              | Feature flag states                            |
| GET    | `/site/sitemap`               | Every public path with its last modification   |
| GET    | `/site/seo/route/:key`        | SEO metadata for a hardcoded route             |

`/site/bootstrap` is one call that returns everything the chrome needs.
Role-restricted menu items are filtered server-side, so a staff-only entry is
absent from an anonymous response entirely.

### Catalogue

| Method | Path                                    | Description                        |
| ------ | --------------------------------------- | ---------------------------------- |
| GET    | `/categories`                           | Category tree                      |
| GET    | `/categories/:slug`                     | One category with its children     |
| GET    | `/courses`                              | Published courses, filtered        |
| GET    | `/courses/featured`                     | Featured courses                   |
| GET    | `/courses/:slug`                        | Course detail with curriculum      |
| GET    | `/courses/:slug/lessons/:lessonSlug`    | Lesson content (access-checked)    |
| GET    | `/courses/:slug/lessons/:lessonSlug/pdf` | Lesson PDF, streamed (access-checked) |
| GET    | `/instructors`                          | Instructor directory               |
| GET    | `/instructors/:slug`                    | Profile plus their courses         |
| GET    | `/documents/:id`                        | A published PDF, streamed          |

`GET /courses` accepts `category`, `level`, `access`, `tag`, `instructor`,
`featured`, plus the common list parameters. It returns published courses only —
sending `status=DRAFT` does not change that; the parameter is honoured on the
admin router alone.

`GET /courses/:slug` includes a `viewer` object when a session is present:
enrollment state, progress percentage and the lesson to resume at.

**Lesson access** is granted when the lesson is a free preview, or the viewer is
enrolled with an active, unexpired enrollment, or the viewer holds
`courses.update` (staff preview). Otherwise: 403 when signed in, 403 when
anonymous, 404 when the course is not published.

#### The lesson PDF stream — requires `PDF_READER_ENABLED`

`GET /courses/:slug/lessons/:lessonSlug/pdf` serves the bytes behind the
in-browser reader. It runs the **same access check as the lesson body**: gating
the lesson while leaving its PDF open to anyone holding the URL would be no gate
at all. It answers 404 when the lesson has no source PDF, and 404 when the
feature is switched off in the admin panel.

Unlike the object-storage URL in `sourcePdfUrl`, this endpoint is
per-viewer and never cacheable:

| Header                | Value                                            |
| --------------------- | ------------------------------------------------ |
| `Accept-Ranges`       | `bytes`                                          |
| `Content-Range`       | on a 206, `bytes <start>-<end>/<size>`           |
| `Cache-Control`       | `private, no-store`                              |
| `Content-Disposition` | `inline`, with an RFC 6266 filename              |

`Range` is honoured for a single interval; a suffix range (`bytes=-1024`) works,
and an unsatisfiable one answers 416 with `Content-Range: bytes */<size>`. A
multi-range request is answered with the whole body rather than a
`multipart/byteranges` response. This is what lets pdf.js read the trailer and
render page one without downloading the file first — see
[architecture.md](architecture.md#reading-pdfs-in-place).

The lesson payload advertises the stream only when it will actually serve:

```json
"pdfReader": {
  "url": "/api/v1/courses/<slug>/lessons/<lessonSlug>/pdf",
  "fileName": "networking-primer.pdf",
  "sizeBytes": 4194304
}
```

It is `null` when the lesson has no source PDF or when `PDF_READER_ENABLED` is
off, so a client never renders a reader that would only 404. `sourcePdfUrl` is
unaffected by the flag: the original stays downloadable either way.

Because one open document issues many range requests, this path is excluded from
the global rate limit and counted against its own — see
[security.md](security.md#rate-limiting).

#### The published document stream

`GET /documents/:id` serves a library PDF by media id. It is what a CMS page's
`PDF_GALLERY` section reads from, and it needs no session: an editor put the
document on a public page, and every media object is already reachable at an
unauthenticated storage URL. What the endpoint adds is a *same-origin* path with
range support — the app's CSP names its own origin and the API's, not whichever
bucket the storage driver points at, and pdf.js reads through `fetch` rather than
an `<img>`.

Two refusals, both answered 404 so nothing about the library leaks:

- anything that is not `application/pdf`;
- anything attached to a lesson, as a source PDF or an attachment. Course
  material stays behind the lesson's own access check, so picking a paid
  course's PDF for a public gallery cannot republish the course.

Response headers and `Range` handling are identical to the lesson stream above,
and it shares the same rate-limit bucket.

### Content

| Method | Path              | Description                       |
| ------ | ----------------- | --------------------------------- |
| GET    | `/pages/:slug`    | A published, enabled CMS page     |
| GET    | `/blog`           | Published articles                |
| GET    | `/blog/tags`      | Tags in use                       |
| GET    | `/blog/:slug`     | One article                       |
| GET    | `/legal`          | Legal documents                   |
| GET    | `/legal/:slug`    | One document at its current version |
| GET    | `/search`         | Site-wide search                  |
| GET    | `/search/suggest` | Typeahead                         |
| GET    | `/collections`    | Published reference collections   |
| GET    | `/collections/:slug` | A collection and **all** its published entries |
| GET    | `/collections/:slug/entries/:entrySlug` | One entry, with its panels |

The collection index returns its entries whole rather than a page at a time,
capped server-side at 500. The grid searches and filters in the browser, which
is what makes typing feel instant and lets the same component be dropped onto
any CMS page via the `COLLECTION_GRID` section; paginating it would mean the
search could not see past page one. Drafts are excluded from both reads.

### Shop — requires `SHOP_ENABLED`

| Method | Path                    | Description                                  |
| ------ | ----------------------- | -------------------------------------------- |
| GET    | `/shop/products`        | Active products                              |
| GET    | `/shop/categories`      | Product categories                           |
| GET    | `/shop/products/:slug`  | One product                                  |
| POST   | `/shop/cart/price`      | Price a cart from ids and quantities         |
| POST   | `/shop/checkout`        | Create an order                              |

The cart endpoints accept **ids and quantities only**. Every total is computed
server-side from live product rows, so a tampered payload cannot change what an
order costs.

### Forms

| Method | Path                     | Feature flag           |
| ------ | ------------------------ | ---------------------- |
| POST   | `/contact`               | `CONTACT_FORM_ENABLED` |
| POST   | `/newsletter/subscribe`  | `NEWSLETTER_ENABLED`   |

---

## Account — `/account`

All routes require authentication. **Every handler derives its subject from the
session**, never from the request — there is no endpoint that accepts a user id.

| Method | Path                                   | Description                             |
| ------ | -------------------------------------- | --------------------------------------- |
| GET    | `/account/profile`                     | Full profile with learning statistics   |
| PATCH  | `/account/profile`                     | Update name, headline, bio, avatar      |
| POST   | `/account/avatar`                      | Upload an avatar (images, 2MB)          |
| PATCH  | `/account/preferences`                 | Locale, theme, email preferences        |
| GET    | `/account/dashboard`                   | Stats, continue-learning, recent courses |
| GET    | `/account/stats`                       | Learning statistics                     |
| GET    | `/account/enrollments`                 | Enrolled courses with progress          |
| POST   | `/account/enrollments`                 | Self-enroll (verified email required)   |
| GET    | `/account/enrollments/:courseId`       | One enrollment                          |
| DELETE | `/account/enrollments/:courseId`       | Cancel an enrollment                    |
| GET    | `/account/courses/:courseId/progress`  | Progress plus completed lesson ids      |
| GET    | `/account/lessons/:lessonId`           | Lesson content, marks it as visited     |
| PUT    | `/account/lessons/:lessonId/progress`  | Record completion or video position     |
| GET    | `/account/legal/pending`               | Documents awaiting acceptance           |
| POST   | `/account/legal/accept`                | Record acceptance                       |
| GET    | `/account/orders`                      | Own orders                              |
| GET    | `/account/orders/:id`                  | One own order                           |
| GET    | `/account/sessions`                    | Active sessions (metadata only)         |
| POST   | `/account/sessions/revoke`             | End one of your own sessions            |

Self-enrollment is refused for `PAID`, `INVITE_ONLY` and `PRIVATE` courses, and
requires a verified email address. An administrator can create those
enrollments through the admin router.

**Example**

```http
PUT /api/v1/account/lessons/clx.../progress
Authorization: Bearer <token>
Content-Type: application/json

{ "isCompleted": true }
```

```json
{
  "success": true,
  "data": {
    "lesson": { "lessonId": "clx…", "isCompleted": true,
                "completedAt": "2026-08-21T11:04:00.000Z", "lastPositionSeconds": 0 },
    "course": { "courseId": "clx…", "completedLessons": 3, "totalLessons": 8,
                "progressPercent": 38, "lastLessonId": "clx…", "completedAt": null }
  }
}
```

---

## Admin — `/admin`

Requires authentication plus at least one admin permission, and each route
requires its own specific permission. The permission is listed beside each
group.

### Overview and users

| Method | Path                       | Permission                       |
| ------ | -------------------------- | -------------------------------- |
| GET    | `/admin/overview`          | `analytics.read`                 |
| GET    | `/admin/users`             | `users.read`                     |
| GET    | `/admin/users/:id`         | `users.read`                     |
| POST   | `/admin/users`             | `users.create`                   |
| PATCH  | `/admin/users/:id`         | `users.update`                   |
| PUT    | `/admin/users/:id/roles`   | `users.update` + `roles.manage`  |
| POST   | `/admin/users/:id/delete`  | `users.delete`                   |

Deletion takes a `strategy` of `deactivate`, `anonymize` or `purge`. There is no
default — the choice must be explicit.

### Roles

| Method | Path                | Permission     |
| ------ | ------------------- | -------------- |
| GET    | `/admin/roles`      | `roles.read`   |
| GET    | `/admin/permissions`| `roles.read`   |
| POST   | `/admin/roles`      | `roles.manage` |
| PATCH  | `/admin/roles/:id`  | `roles.manage` |
| DELETE | `/admin/roles/:id`  | `roles.manage` |

### Courses and curriculum

| Method | Path                                      | Permission        |
| ------ | ----------------------------------------- | ----------------- |
| GET    | `/admin/courses`                          | `courses.read`    |
| GET    | `/admin/courses/:id`                      | `courses.read`    |
| GET    | `/admin/courses/:id/analytics`            | `analytics.read`  |
| POST   | `/admin/courses`                          | `courses.create`  |
| PATCH  | `/admin/courses/:id`                      | `courses.update`  |
| PUT    | `/admin/courses/:id/status`               | `courses.publish` |
| POST   | `/admin/courses/:id/duplicate`            | `courses.create`  |
| DELETE | `/admin/courses/:id`                      | `courses.delete`  |
| POST   | `/admin/courses/:id/restore`              | `courses.update`  |
| POST   | `/admin/courses/:courseId/modules`        | `courses.update`  |
| PATCH  | `/admin/modules/:id`                      | `courses.update`  |
| DELETE | `/admin/modules/:id`                      | `courses.update`  |
| PUT    | `/admin/courses/:courseId/modules/reorder`| `courses.update`  |
| GET    | `/admin/lessons/:id`                      | `courses.read`    |
| POST   | `/admin/lessons`                          | `courses.update`  |
| PATCH  | `/admin/lessons/:id`                      | `courses.update`  |
| DELETE | `/admin/lessons/:id`                      | `courses.update`  |
| PUT    | `/admin/modules/:moduleId/lessons/reorder`| `courses.update`  |

Publishing refuses when a course has no published lessons.

### PDF import

| Method | Path                          | Permission       |
| ------ | ----------------------------- | ---------------- |
| POST   | `/admin/content/pdf/preview`  | `courses.update` |
| POST   | `/admin/content/pdf/import`   | `courses.update` |

Preview extracts and returns the converted document plus warnings, without
writing anything. Import creates lessons — always as drafts, optionally split by
top-level heading, optionally keeping the original PDF as a download.

### CMS

| Method | Path                                     | Permission      |
| ------ | ---------------------------------------- | --------------- |
| GET    | `/admin/pages`                           | `pages.read`    |
| POST   | `/admin/pages`                           | `pages.create`  |
| PATCH  | `/admin/pages/:id`                       | `pages.update`  |
| DELETE | `/admin/pages/:id`                       | `pages.delete`  |
| POST   | `/admin/pages/:pageId/sections`          | `pages.update`  |
| PATCH  | `/admin/sections/:id`                    | `pages.update`  |
| DELETE | `/admin/sections/:id`                    | `pages.update`  |
| POST   | `/admin/sections/:id/duplicate`          | `pages.update`  |
| PUT    | `/admin/pages/:pageId/sections/reorder`  | `pages.update`  |
| GET    | `/admin/menus`, `/admin/menus/:slug/items` | `menus.manage` |
| POST   | `/admin/menus/:slug/items`               | `menus.manage`  |
| PATCH  | `/admin/menu-items/:id`                  | `menus.manage`  |
| DELETE | `/admin/menu-items/:id`                  | `menus.manage`  |
| PUT    | `/admin/menus/:slug/reorder`             | `menus.manage`  |
| GET/POST/PATCH/DELETE | `/admin/footer/...`       | `menus.manage`  |
| GET/POST/PATCH/DELETE | `/admin/blog/...`         | `blog.read` / `blog.manage` |
| GET/POST/PATCH        | `/admin/legal/...`        | `legal.manage`  |

### Reference collections

| Method | Path                                     | Permission            |
| ------ | ---------------------------------------- | --------------------- |
| GET    | `/admin/collections`                     | `collections.read`    |
| GET    | `/admin/collections/:id`                 | `collections.read`    |
| POST   | `/admin/collections`                     | `collections.manage`  |
| PATCH  | `/admin/collections/:id`                 | `collections.manage`  |
| DELETE | `/admin/collections/:id`                 | `collections.manage`  |
| POST   | `/admin/collections/:id/categories`      | `collections.manage`  |
| PATCH  | `/admin/collection-categories/:id`       | `collections.manage`  |
| DELETE | `/admin/collection-categories/:id`       | `collections.manage`  |
| GET    | `/admin/collections/:id/entries`         | `collections.read`    |
| POST   | `/admin/collections/:id/entries`         | `collections.manage`  |
| PUT    | `/admin/collections/:id/entries/reorder` | `collections.manage`  |
| GET    | `/admin/collection-entries/:id`          | `collections.read`    |
| PATCH  | `/admin/collection-entries/:id`          | `collections.manage`  |
| DELETE | `/admin/collection-entries/:id`          | `collections.manage`  |

A collection is an encyclopedia of many small, similar entries; deleting one is
a soft delete, since its URLs may be linked. Deleting a *filter* leaves its
entries in place and uncategorised.

An entry's `panels` are the boxes its detail page is built from — a closed set
of five shapes, each naming the column it sits in:

```jsonc
{
  "id": "p-desc",
  "kind": "TEXT",          // TEXT | LIST | FACTS | TABLE | LINKS
  "column": "MAIN",        // MAIN | SIDE
  "tone": "DANGER",        // DEFAULT | INFO | SUCCESS | WARNING | DANGER
  "title": "Security information",
  "iconName": "ShieldAlert",
  "body": "Paragraph one.\n\nParagraph two.",  // TEXT
  "items": [],                                  // LIST
  "facts": [],                                  // FACTS: {label, value}
  "table": null,                                // TABLE: {columns, rows}
  "links": []                                   // LINKS: {label, sublabel, href, badge, tone}
}
```

Fields belonging to other kinds are kept rather than stripped, so switching a
panel's kind in the editor loses nothing. A panel whose `kind` the reading build
does not recognise is skipped, never guessed at.

### Media

| Method | Path                  | Permission     |
| ------ | --------------------- | -------------- |
| GET    | `/admin/media`        | `media.read`   |
| GET    | `/admin/media/folders`| `media.read`   |
| GET    | `/admin/media/unused` | `media.delete` |
| POST   | `/admin/media`        | `media.upload` |
| PATCH  | `/admin/media/:id`    | `media.upload` |
| DELETE | `/admin/media/:id`    | `media.delete` |

Upload is `multipart/form-data` with a `file` field. Deletion is refused while
anything still references the file.

### Platform

| Method | Path                          | Permission             |
| ------ | ----------------------------- | ---------------------- |
| GET    | `/admin/languages`            | `languages.manage`     |
| PATCH  | `/admin/languages/:code`      | `languages.manage`     |
| GET    | `/admin/translations/:locale` | `translations.manage`  |
| PUT    | `/admin/translations`         | `translations.manage`  |
| PUT    | `/admin/seo/route`            | `seo.manage`           |
| GET    | `/admin/features`             | `features.manage`      |
| PUT    | `/admin/features/:key`        | `features.manage`      |
| GET    | `/admin/settings`             | `settings.manage`      |
| PUT    | `/admin/settings`             | `settings.manage`      |
| GET    | `/admin/audit-logs`           | `audit.read`           |
| GET    | `/admin/enrollments`          | `enrollments.read`     |
| POST   | `/admin/enrollments`          | `enrollments.manage`   |
| DELETE | `/admin/enrollments/:userId/:courseId` | `enrollments.manage` |
| GET/POST/PATCH/DELETE | `/admin/products/...` | `products.read` / `products.manage` |
| GET    | `/admin/orders`, `/admin/orders/:id` | `orders.read`   |
| PUT    | `/admin/orders/:id/status`    | `orders.manage`        |

---

## Realtime — `/realtime`

One WebSocket per tab, for every visitor. `GET /api/v1/realtime` accepts an HTTP
upgrade; it is not an Express route and does not answer ordinary requests.

**Handshake.** A browser `WebSocket` cannot set headers, so the access token
travels as a subprotocol token rather than in the query string, where it would
reach every access log on the way. Omitting it is legitimate and yields the
public feed:

```js
// signed in
new WebSocket('wss://api.example.com/api/v1/realtime', [
  'academy.v1',
  `bearer.${accessToken}`,
]);

// anonymous — the public feed
new WebSocket('wss://api.example.com/api/v1/realtime', ['academy.v1']);
```

The server echoes back `academy.v1` only. It rejects the upgrade with a plain
HTTP status rather than opening a socket first:

| Status | Reason                                                            |
| ------ | ----------------------------------------------------------------- |
| 401    | A token was presented and is invalid, or the account cannot sign in |
| 403    | `Origin` not in the CORS allowlist                                |
| 429    | Six sockets already open for the account, or 64 from one address  |
| 503    | The public feed is switched off, or at its anonymous ceiling      |
| 404    | Any path other than `/api/v1/realtime`                            |

**Audiences.** What a socket receives is fixed at the handshake and is
cumulative — anonymous is `["public"]`, signed-in is `["public","learner"]`, an
admin permission adds `"admin"`. There is no subscribe message; a client cannot
ask for more than its credential granted.

**Messages.** The server sends JSON; the client only ever answers `{"type":"pong"}`.

```jsonc
// once, on connect. `sessionExpiresAt` is null for an anonymous socket.
{ "type": "ready", "audiences": ["public", "learner", "admin"],
  "resources": ["courses", "audit"],
  "sessionExpiresAt": "2026-01-01T12:15:00.000Z", "serverTime": "…" }

// every 30s; answer with {"type":"pong"} or be disconnected
{ "type": "ping", "at": "…" }

// public — reaches anonymous sockets, so it carries nothing but an area
{ "type": "public.changed", "channels": ["catalog"], "at": "…" }

// learner — delivered only to that account's sockets
{ "type": "learner.changed", "topics": ["enrollments", "progress"], "at": "…" }

// admin — the detailed one
{ "type": "resource.changed", "resources": ["courses", "audit", "overview"],
  "action": "course.updated", "targetType": "course", "targetId": "…",
  "actor": { "id": "…", "name": "Sona" }, "at": "…" }
```

Public channels are `catalog`, `content`, `navigation`, `commerce`, `platform`.
Learner topics are `enrollments`, `progress`, `orders`, `profile`.

**An event never carries the changed record.** It names what went stale, and the
client refetches through the ordinary authorised endpoint. A socket therefore
cannot become a second read path that skips a permission check — which is what
makes it safe to hand one to an anonymous visitor. `resources` is filtered per
subscriber (an editor without `users.read` is not told that a user changed), and
a public event carries no id, no actor and no publication state, so a draft
being edited is indistinguishable from anything else.

**Close codes** are application-defined above 4000:

| Code | Meaning                                                          |
| ---- | ---------------------------------------------------------------- |
| 4440 | The access token behind the socket expired. Refresh and reconnect |
| 4503 | The API is shutting down. Reconnect; not an error                 |
| 4403 | The account may not use the feed. Do not retry                    |

A socket carrying a session never outlives the token it presented, which is what
keeps a revoked role from holding a live feed open until the tab closes. An
anonymous socket presented nothing and so has nothing to outlive; the heartbeat
reaps it.

---

## Health

| Method | Path            | Description                                  |
| ------ | --------------- | -------------------------------------------- |
| GET    | `/health`       | Liveness — never gated, no database required  |
| GET    | `/health/ready` | Readiness — verifies the database connection  |

Both sit outside `/api/v1` and outside every gate, so an orchestrator never sees
a 503 from maintenance mode.

---

## Rate limits

See [security.md](security.md#rate-limiting) for the full table. Limited
responses return 429 with `RATE_LIMITED` and standard `RateLimit-*` headers.
