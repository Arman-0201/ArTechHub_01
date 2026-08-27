# Development

## Setup

```bash
npm install
cp .env.example .env      # set DATABASE_URL and the three secrets
npm run build:packages    # the apps consume compiled package output
npm run db:push
npm run db:seed
npm run dev
```

`npm run dev` builds the shared packages first, then runs the API and the web
app together with combined output.

### When you change a shared package

`packages/types` and `packages/validation` compile to `dist/`. After editing
them, rebuild:

```bash
npm run build:packages
```

Or leave a watcher running in a second terminal:

```bash
npm run dev --workspace @academy/types
```

### When you change the Prisma schema

```bash
npm run db:push          # local iteration
npm run db:migrate       # anything that will reach another environment
```

`prisma generate` runs automatically on install; run it manually if the client
types look stale.

---

## Working on the backend

### Adding an endpoint

1. **Schema** — add a Zod schema to `packages/validation`, in the file matching
   the domain. Rebuild the package.
2. **Service** — write the logic in `modules/<domain>/<domain>.service.ts`.
   This is where the substance goes.
3. **Route** — wire it up: limiter → validate → authorize → handler.
4. **Audit** — call `recordAudit` for anything destructive or privileged.
5. **Test** — unit-test the logic; add an integration test if it touches
   authorization.

A route should read as a declaration of what must be true before the handler
runs:

```ts
adminRouter.post(
  '/things',
  requirePermissions(PERMISSIONS.THINGS_CREATE),
  validateBody(createThingSchema),
  asyncHandler(async (req, res) => {
    const thing = await thingsService.create(req.body, req.locale);
    await recordAudit(req, {
      action: AUDIT_ACTIONS.THING_CREATED,
      targetType: 'thing',
      targetId: thing.id,
    });
    ok(res, thing, 201);
  }),
);
```

### Rules that are not negotiable

**Never trust a client-supplied identity.** Derive the subject from
`req.user.id`. On the `account` router this is absolute — no handler accepts a
user id.

**Make ownership part of the query.**

```ts
// Wrong
const order = await prisma.order.findUnique({ where: { id } });
if (order.userId !== req.user.id) throw new AuthorizationError();

// Right
const order = await prisma.order.findFirst({ where: { id, userId: req.user.id } });
if (!order) throw new NotFoundError('Order');
```

The second form cannot be got wrong by a later refactor, and answering 404
rather than 403 avoids confirming that someone else's record exists.

**Select only what you need.** `select` beats `include`, and both beat a bare
`findMany`. Reading the whole row to return three fields is how a list endpoint
becomes slow.

**Paginate every list.** `listQuerySchema` caps `pageSize` at 100. There is no
endpoint that returns an unbounded collection.

**Throw typed errors.** `NotFoundError`, `AuthorizationError`, `ConflictError`.
The error handler turns these into the right status and a safe message. A raw
`throw new Error()` becomes a 500.

### Where things live

| Kind of code                        | Goes in                       |
| ----------------------------------- | ----------------------------- |
| Business logic                      | `modules/<domain>/*.service.ts` |
| Non-trivial queries                 | `modules/<domain>/*.repository.ts` |
| HTTP shaping only                   | `modules/<domain>/*.controller.ts` or inline in routes |
| Cross-cutting (crypto, storage, …)  | `lib/`                        |
| Request-pipeline concerns           | `middleware/`                 |
| Shared types                        | `packages/types`              |
| Shared validation                   | `packages/validation`         |

Business logic never goes in a route handler, and HTTP concepts (status codes,
cookies, headers) never go in a service.

---

## Working on the frontend

### Server or client

Default to a Server Component. Add `'use client'` only when the component needs
state, an effect, or an event handler.

Signs you have reached for a Client Component too early:

- Fetching in `useEffect` for data the server already has
- Passing a whole dataset to the client to filter it there
- Making a page client-side so one button can be interactive — extract the
  button instead

### Data fetching

| Context           | Use                          |
| ----------------- | ---------------------------- |
| Server Components | `lib/api/queries.ts`         |
| Client mutations  | `api` from `lib/api/client`  |
| Admin screens     | `useApiList` / `useApiMutation` |

Public pages do not use TanStack Query. Server-fetch and pass props.

### Forms

React Hook Form plus the shared Zod schema, with server field errors mapped back
onto the inputs:

```tsx
const { register, handleSubmit, setError, formState: { errors, isSubmitting } } =
  useForm({ resolver: zodResolver(theSchema) });

async function onSubmit(values) {
  try {
    await api.post('/endpoint', values);
  } catch (error) {
    if (error instanceof ApiError && error.fields) {
      applyServerFieldErrors(error.fields, setError);
      return;
    }
    setFormError(error instanceof ApiError ? error.message : 'Something went wrong.');
  }
}
```

Client validation is for feedback speed. The server validates independently.

### Styling

Use the semantic tokens, never a raw brand colour:

```tsx
// Wrong — breaks in dark mode
<div className="bg-white text-[#091540]">

// Right
<div className="bg-surface text-text-primary">
```

The token set is in `app/globals.css`. Light is the base; dark redefines only
the tokens. A component written against tokens gets dark mode for free.

### Accessibility

Non-negotiable, and cheap when done from the start:

- Semantic elements — a `<button>` for an action, an `<a>` for navigation
- Every input has a label; use the `Input`/`Select`/`Textarea` primitives, which
  wire up `aria-describedby` and error announcement for you
- Visible focus (the global `:focus-visible` ring handles this — do not remove it)
- `aria-expanded` and `aria-controls` on anything that toggles
- Icon-only buttons need an `aria-label`
- Decorative icons need `aria-hidden="true"`
- Never signal state by colour alone
- Drag-and-drop needs a keyboard path — see `SortableList`, where Alt+arrow
  moves the focused item and every change is announced

---

## Adding a feature end to end

Here is the full path for a new CMS section type, which touches most layers:

1. `packages/types/src/enums.ts` — add to `SECTION_TYPES`
2. `apps/api/prisma/schema.prisma` — add to the `SectionType` enum, then
   `npm run db:push` (a deployed database needs a migration: one
   `ALTER TYPE "SectionType" ADD VALUE`, as in the PDF gallery's)
3. `apps/web/src/components/sections/blocks.tsx` — write the component. A
   section that needs client state gets its own module instead, so `blocks.tsx`
   stays out of the browser bundle — see `pdf-gallery-section.tsx`, which keeps
   the shell on the server and hands only the grid to the client
4. `apps/web/src/components/sections/registry.tsx` — register it
5. `apps/web/src/components/admin/section-editor.tsx` — add a form branch
6. `page-builder.tsx` — add a label to `SECTION_LABELS`

Section `content` is an open JSON record, so none of this needs a data
migration and every page authored before the new type keeps rendering. Read it
back defensively — a malformed item should disappear, not throw.

The other common paths:

**A permission** — add to `PERMISSIONS` and a `PERMISSION_GROUPS` entry, apply
`requirePermissions(...)` to the routes, re-seed. It appears in the role editor
automatically.

**A locale** — add to `LOCALES`, re-seed, activate in the admin panel.
Optionally add a dictionary; anything missing falls back.

**An OAuth provider** — one entry in `oauth.providers.ts` with its endpoints and
a `fetchProfile`. Nothing else changes.

---

## Testing

```bash
npm run test                                   # unit tests only
TEST_DATABASE_URL=postgresql://…/academy_test npm run test   # plus integration
```

Unit tests need no database and should stay that way — they cover crypto,
validation, sanitisation, slugs and locale fallback.

Integration tests exercise real HTTP flows against a real database and skip
themselves without `TEST_DATABASE_URL`. Point them at a **disposable** database;
they write.

What is worth an integration test: anything where a client could otherwise grant
itself access. Enrollment gating, lesson access, ownership scoping, permission
boundaries, refresh-token reuse detection.

---

## Debugging

**Correlate a failure with a log line.** Every error response carries a
`requestId`, echoed in `x-request-id` and attached to every log line for that
request. Search the logs for it.

**Inspect queries.** Set `LOG_LEVEL=debug` and Prisma warnings appear. For full
SQL, add `query` to the Prisma log array in `lib/prisma.ts`.

**Read emails locally.** `MAIL_TRANSPORT=console` writes the whole message,
including verification and reset links, to the API log — the full flow is
testable with no SMTP server.

**A 403 you did not expect.** Check the permission on the route, then the
role's permission set in the admin panel. Remember that permissions are read
from the database per request, so a role change applies on the next request —
but the *access token* is only invalidated when `tokenVersion` bumps.

---

## Conventions

**Names describe the domain.** `resolveLocaleChain`, not `getChain`.
`assertNotLastSuperAdmin`, not `check`. Never `data`, `temp`, `handleStuff`.

**Comments explain why, not what.**

```ts
// Bad — restates the code
// Increment the token version
user.tokenVersion += 1;

// Good — explains the decision
// Bumping the version invalidates every access token already issued, so a
// revoked role stops granting access immediately rather than at expiry.
user.tokenVersion += 1;
```

**TypeScript is strict.** `any` is a last resort. Prefer a discriminated union
over a bag of optional fields — if two pieces of state can never be true at
once, they are one piece of state wearing a disguise.

**Keep files focused.** A component past ~400 lines usually contains two
components. A service past ~500 usually contains two concerns.

---

## Before opening a pull request

```bash
npm run typecheck
npm run test
npm run build
```

Then check by hand:

- New endpoints validate their input and check authorization
- Ownership is part of the query where it applies
- New lists are paginated
- Destructive actions are audited
- New UI works with a keyboard and in dark mode
- No secret, key or token is in the diff
