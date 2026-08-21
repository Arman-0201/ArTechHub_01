# Database

PostgreSQL, accessed through Prisma. The schema is
`apps/api/prisma/schema.prisma`; this document explains the decisions behind it.

## Why PostgreSQL

The domain is densely relational — users to roles to permissions, courses to
modules to lessons to progress, pages to sections to translations, orders to
items. Nearly every read crosses two or more of those boundaries. Foreign keys,
composite unique constraints and transactional writes are load-bearing here, not
conveniences.

Two features are used specifically: `String[]` array columns for small bounded
lists (tags, learning outcomes, role visibility) where a join table would add
cost without adding value, and `Json` columns for structured rich-text
documents, which are read and written whole and never queried into.

---

## Conventions

- `cuid()` primary keys — sortable, collision-free, and safe to expose in an
  admin URL. Public URLs use `slug`, never an id.
- `sortOrder` integers on every admin-reorderable collection.
- `createdAt` / `updatedAt` on every entity that is edited.
- `snake_case` table names via `@@map`; `camelCase` in the client.
- Soft delete (`deletedAt`) only where history matters — see below.

---

## Domains

### Identity and access

```
User ──< UserRole >── Role ──< RolePermission >── Permission
 │
 ├──< AuthProvider          OAuth links
 ├──< RefreshToken          Rotation chains
 ├──< VerificationToken     Email, reset, OTP
 └──< UserLegalAcceptance >── LegalDocumentVersion
```

`User.tokenVersion` is the session kill switch — incrementing it invalidates
every outstanding access token for that user. `failedLoginCount` and
`lockedUntil` back the account lockout.

`RefreshToken` stores only a keyed hash, plus a `familyId` that ties a token to
its rotation chain and a `replacedById` pointer. Presenting a revoked token
means the chain was compromised, and the whole family is revoked.

Roles are dynamic; permissions are code-defined. `Permission.key` matches the
catalogue in `packages/types/src/permissions.ts`, and the seed keeps the table
in step.

### Learning

```
Category ──< Category (one level of nesting)
    │
    └──< Course ──< CourseModule ──< Lesson ──< LessonAttachment >── Media
           │                            │
           │                            └──< LessonProgress >── User
           ├──< CourseInstructor >── Instructor
           ├──< CourseTag >── Tag
           ├──< Enrollment >── User
           └──< CourseProgress >── User
```

`Course` carries two denormalised counters — `lessonCount` and
`enrollmentCount` — maintained in the same transaction as the rows they count.
Reading them avoids a `COUNT` on every catalogue card render.

`CourseProgress` is a persisted aggregate of `LessonProgress`, recomputed inside
the same transaction as every progress write. Dashboards and course cards read
one row instead of aggregating, and no client-side arithmetic can disagree with
the server.

`LearningDay` is one row per user per day with activity — the cheapest way to
compute streaks without scanning progress history.

**Progress denominators count only reachable lessons.** An unpublished lesson,
or one inside an unpublished module, must not inflate everyone's percentage, so
`recalculateCourseAggregates` filters on both.

### CMS

```
Page ──< PageSection ──< SectionTranslation
  └──< PageTranslation

Menu ──< MenuItem ──< MenuItem (one level)
              └──< MenuItemTranslation

FooterGroup ──< FooterLink
BlogPost ──< BlogPostTag >── Tag
```

A `PageSection` is `type` plus two JSON blobs: `settings` (layout knobs) and
`content` (copy and media references). The frontend renders it through a
component registry. This is what makes the page builder controlled rather than
arbitrary — there is no template language and no free-form markup path.

`Page.isSystem` marks pages that back a hardcoded route. They can be edited and
disabled but never deleted or re-slugged, so the route always resolves.

### Localisation

Translatable content lives in `*Translation` side tables keyed by
`(entityId, locale)`. Adding a language never requires a schema change.

`Language` rows describe availability; `Translation` rows hold UI strings keyed
by `(locale, namespace, key)`. `Language.fallbackCode` drives the chain that
makes `en-GB` fall back to `en`.

### SEO

One `SeoMetadata` table with a nullable, unique foreign key per entity type plus
a `routeKey` for hardcoded routes. Exactly one is set per row. One table means
one form, one renderer and one sitemap query.

### Commerce

```
ProductCategory ──< Product ──< ProductImage >── Media
                        └──< OrderItem >── Order ──> User
```

Money is stored as integer minor units (`priceCents`). Floating-point money is a
rounding bug waiting to happen.

`OrderItem` snapshots `name` and `unitPriceCents`. An order must remain readable
after the product is renamed, repriced or deleted.

`Order` carries provider-agnostic `paymentProvider` and `paymentReference`
columns. No card data is stored.

### Platform

`Setting` is key/value rather than a single blob, so two administrators editing
different screens cannot overwrite each other's work.

`FeatureFlag` holds state; the key set is code-defined.

`LegalDocument` → `LegalDocumentVersion` → `UserLegalAcceptance`. Consent is
only meaningful against a specific text, so acceptance points at an immutable
version.

`AuditLog` is append-only with a nullable actor — `onDelete: SetNull` keeps the
history after an actor is removed.

---

## Soft delete

Applied only where recovery or history genuinely matters:

| Entity     | Strategy                | Why                                             |
| ---------- | ----------------------- | ----------------------------------------------- |
| `User`     | `deletedAt` + anonymise | Legal records, progress history, GDPR erasure   |
| `Course`   | `deletedAt` + `ARCHIVED` | Enrollments and progress must survive           |
| `Page`     | `deletedAt`             | Accidental deletion of published content        |
| `Product`  | `deletedAt`             | Past orders must still resolve the product      |
| `BlogPost` | `deletedAt`             | Same as pages                                   |

Everything else is hard-deleted or uses an explicit status. Soft-deleting
everything is a common mistake: it means every query needs a filter, and one
forgotten `deletedAt: null` becomes a data leak.

Where soft delete applies, **every** query filters on it. `Course.deletedAt` is
indexed for that reason.

---

## Cascade behaviour

| Relation                    | On delete  | Rationale                                      |
| --------------------------- | ---------- | ---------------------------------------------- |
| `User` → tokens, roles      | `Cascade`  | Meaningless without the user                    |
| `Course` → modules → lessons | `Cascade` | The structure belongs to the course             |
| `Lesson` → progress         | `Cascade`  | Progress against a deleted lesson has no meaning |
| `Page` → sections           | `Cascade`  | Sections belong to the page                     |
| `MenuItem` → children       | `Cascade`  | Deleting a submenu head removes the branch      |
| `Course` → category         | `SetNull`  | Deleting a category must not delete courses     |
| `Media` → references        | `SetNull`  | A missing image must not delete a course        |
| `Order` → user              | `SetNull`  | Orders outlive accounts                         |
| `OrderItem` → product       | `SetNull`  | Snapshotted name and price keep it readable     |
| `AuditLog` → actor          | `SetNull`  | History survives the actor                      |

---

## Indexes

Every index exists for a query that runs on a hot path.

**Identity**
- `users.email` (unique) — login
- `users(status)`, `users(createdAt)`, `users(deletedAt)` — admin list filters
- `refresh_tokens.tokenHash` (unique) — refresh lookup
- `refresh_tokens(familyId)` — family revocation on reuse detection
- `refresh_tokens(expiresAt)` — the pruning job
- `verification_tokens(tokenHash)`, `(userId, purpose)` — verification lookups

**Catalogue**
- `courses(status, publishedAt)` — the public catalogue's default ordering
- `courses(categoryId, status)` — category pages
- `courses(isFeatured, status)` — the home page grid
- `courses.slug` (unique) — course pages
- `course_modules(courseId, sortOrder)`, `lessons(moduleId, sortOrder)` — curriculum ordering
- `lessons(moduleId, slug)` (unique) — lesson URLs

**Progress**
- `enrollments(userId, courseId)` (unique) — the access check on every lesson load
- `enrollments(courseId, status)`, `(userId, status)`, `(enrolledAt)` — admin lists and trends
- `lesson_progress(userId, lessonId)` (unique) — the progress upsert
- `lesson_progress(userId, courseId)` — recomputing course progress
- `course_progress(userId, courseId)` (unique), `(userId, lastAccessedAt)` — "continue learning"
- `learning_days(userId, day)` (unique) — streaks

**CMS and platform**
- `pages(status, isEnabled)`, `page_sections(pageId, sortOrder)`
- `menu_items(menuId, parentId, sortOrder)`
- `translations(locale, namespace, key)` (unique), `(locale, namespace)`
- `audit_logs(createdAt)`, `(actorId)`, `(action)`, `(targetType, targetId)`

### Known scaling limits

- **Search uses `ILIKE`.** Correct and injection-safe, but it cannot use a
  B-tree index and will degrade past a few hundred thousand rows. Add a GIN
  index with `pg_trgm`, move to `tsvector`, or adopt a search engine —
  `search.service.ts` is the single seam.
- **Offset pagination** degrades on very deep pages. The response envelope
  already carries a `nextCursor` field for a cursor-based migration.
- **The `enrollments(enrolledAt)` trend query** scans a 30-day window. Beyond
  a few million enrollments, a materialised daily rollup would be better.

---

## Migrations

```bash
npm run db:migrate      # create and apply (development)
npm run db:deploy       # apply only (production, in the release step)
npm run db:push         # sync without a migration (prototyping only)
npm run db:reset        # drop, recreate, migrate, seed (destructive)
```

Use `db:push` while iterating on a local schema; use `db:migrate` for anything
that will reach another environment.

---

## Seeding

`apps/api/prisma/seed.ts` is idempotent — every write is an upsert keyed on a
stable slug, so re-running refreshes structure without destroying content.

It creates: the permission catalogue, six system roles with explicit permission
sets, a Super Admin owner, all eight languages, UI translations for English,
Armenian and Russian, feature-flag rows, site settings, a category tree,
instructors, four fully-written demo courses, the system CMS pages with their
sections, navigation and footer, four versioned legal documents, three articles,
and two shop products.

An existing owner keeps their password: re-seeding must never reset a credential
an operator has already changed.

---

## Backups

Not automated by the platform — that belongs to your database provider.

- Enable point-in-time recovery
- Test a restore before you need one
- `Media` rows reference external storage; back that up on the same schedule, or
  the database will restore to a set of broken links
