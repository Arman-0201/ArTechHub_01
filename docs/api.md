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
| GET    | `/instructors`                          | Instructor directory               |
| GET    | `/instructors/:slug`                    | Profile plus their courses         |

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
