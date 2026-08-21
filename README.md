# Academy Platform

A production-ready online IT learning platform: a public marketing site driven
by a CMS, a course catalogue, a reading-first learning experience with
server-side progress tracking, a student dashboard, and a full admin panel that
controls almost everything without a deployment.

```
apps/
  api/          Express + TypeScript + Prisma + PostgreSQL
  web/          Next.js 15 (App Router) + TypeScript + Tailwind v4
packages/
  types/        Shared domain types, permission catalogue, locale catalogue
  validation/   Zod schemas shared by the API and the web forms
  config/       Shared TypeScript configuration presets
docs/           Architecture, database, security, API and development guides
```

---

## What it does

**Public site** — CMS-driven pages built from reorderable typed sections,
dynamic navigation and footer, course catalogue with server-side filtering,
course detail pages, an instructor directory, a blog, versioned legal documents,
site-wide search, and an optional shop.

**Learning** — a curriculum sidebar plus a reading pane using proper long-form
typography, rather than a document viewer. Progress is stored server-side, so it
follows the learner between devices. Lessons support rich structured content,
video, attachments and PDF-derived material.

**Accounts** — registration, email verification, OTP, password reset, OAuth
(Google and GitHub), a student dashboard with real learning statistics, profile
and preferences, and visible session management.

**Admin** — users, dynamic roles and permissions, courses with a curriculum
editor and PDF import, categories, instructors, enrollments, CMS pages with a
drag-and-drop section builder, navigation, media library, blog, legal documents,
languages and translations, SEO, feature flags, settings, products, orders, and
an audit log.

**Platform** — eight locales including Armenian and a British English variant,
feature flags enforced on the server, maintenance mode, structured SEO with
`hreflang` and a generated sitemap, and a light/dark design system built on
semantic tokens.

---

## Requirements

- **Node.js 20.11+** (22 or 24 recommended)
- **PostgreSQL 14+** — local, Supabase, Neon, RDS, or any other provider
- **npm 10+** (the repo uses npm workspaces)

Optional: an S3-compatible bucket for media in production, and SMTP credentials
for transactional email. Both have working local defaults.

---

## Getting started

```bash
# 1. Install everything (one lockfile, all workspaces)
npm install

# 2. Create your environment files
cp .env.example apps/api/.env
cp apps/web/.env.local.example apps/web/.env.local
```

Edit `apps/api/.env` and set, at minimum:

```ini
DATABASE_URL=postgresql://user:password@localhost:5432/academy?schema=public
# Prisma needs a value here too — the same URL unless you are behind a pooler.
DIRECT_URL=postgresql://user:password@localhost:5432/academy?schema=public

# Generate each of these separately:
#   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
JWT_ACCESS_SECRET=…
JWT_REFRESH_SECRET=…
TOKEN_PEPPER_SECRET=…
```

Then set up the database and start both apps:

```bash
# 3. Build the shared packages, create the schema, and seed
npm run build:packages
npm run db:push          # or: npm run db:migrate  (creates a migration)
npm run db:seed

# 4. Run the API and the web app together
npm run dev
```

| Service    | URL                            |
| ---------- | ------------------------------ |
| Web app    | http://localhost:3000          |
| API        | http://localhost:4000          |
| Health     | http://localhost:4000/health   |
| Prisma Studio | `npm run db:studio`         |

The seed prints the owner account it created:

```
Owner account: admin@academy.local
Password:      Admin123!Change
```

**Change that password immediately after signing in.** In any shared or
deployed environment, set `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` before
seeding instead of using the defaults.

The seed is idempotent — re-running it refreshes structure (roles, permissions,
languages, feature definitions, system pages) without resetting an existing
owner's password.

---

## Commands

Run from the repository root:

| Command                  | What it does                                             |
| ------------------------ | -------------------------------------------------------- |
| `npm run dev`            | API and web app together, both watching                   |
| `npm run dev:api`        | API only                                                  |
| `npm run dev:web`        | Web app only                                              |
| `npm run build`          | Build packages, API and web for production                |
| `npm run typecheck`      | Typecheck every workspace                                 |
| `npm run test`           | API test suite                                            |
| `npm run db:push`        | Apply the schema without creating a migration (dev)       |
| `npm run db:migrate`     | Create and apply a migration                              |
| `npm run db:seed`        | Seed roles, languages, pages, navigation and demo content |
| `npm run db:studio`      | Open Prisma Studio                                        |
| `npm run db:reset`       | Drop, recreate, migrate and re-seed (destructive)         |

---

## Testing

```bash
npm run test
```

Unit tests — password hashing, token signing and verification, the HTML
sanitiser, validation schemas, slug generation across scripts, locale fallback —
run anywhere with no database.

Integration tests exercise real HTTP flows (registration, login, refresh-token
rotation and reuse detection, lesson access control, enrollment, progress) and
need a database. They skip themselves unless one is provided:

```bash
# Point at a DISPOSABLE database — these tests write.
TEST_DATABASE_URL=postgresql://user:pass@localhost:5432/academy_test npm run test
```

That database needs the schema applied and the seed run first.

---

## Deployment

The two apps deploy independently.

**API** — build with `npm run build --workspace @academy/api`, run
`node dist/server.js`. Apply migrations with `npm run db:deploy` as part of the
release. It refuses to start in production with placeholder secrets, insecure
cookie settings, an empty CORS allowlist, or the console mail transport — see
`assertProductionSecrets` in `apps/api/src/config/env.ts`.

**Web** — build with `npm run build --workspace @academy/web`, run
`next start`. Set `API_INTERNAL_URL` to the API's address inside your network
and `NEXT_PUBLIC_API_URL` to its public address.

Production checklist:

- Every secret in `.env.example` set to a real generated value
- `COOKIE_SECURE=true`, `CORS_ORIGINS` listing only your real origins
- `TRUST_PROXY=1` when running behind a load balancer or reverse proxy
- `STORAGE_DRIVER=s3` with bucket credentials
- `MAIL_TRANSPORT=smtp` with real SMTP credentials
- A shared rate-limit store if you run more than one API instance
  (see `docs/security.md`)

---

## Documentation

| Document                                   | Covers                                                     |
| ------------------------------------------ | ---------------------------------------------------------- |
| [Architecture](docs/architecture.md)       | System shape, module structure, rendering and caching       |
| [Database](docs/database.md)               | Schema, relationships, indexes, soft-delete policy          |
| [Security](docs/security.md)               | Auth model, authorization, uploads, threats and limits      |
| [API](docs/api.md)                         | Conventions, error envelope, endpoint reference             |
| [Development](docs/development.md)         | Working on the codebase, conventions, adding features       |

---

## License

UNLICENSED — all rights reserved.
