# WebSocket opportunities

An audit of where the live feed already reaches, and where it does not.

**Date:** 2026-08-31 · **Scope:** `apps/api`, `apps/web`, `packages/types`

---

## Summary

This project does not need a WebSocket layer — it already has a good one. `apps/api/src/realtime/hub.ts` is a single hub with three cumulative audiences (`public` / `learner` / `admin`), permission-narrowed fan-out, heartbeats, backpressure limits, per-user and per-address caps, and token-bound socket lifetimes. `apps/web/src/lib/realtime/client.ts` handles backoff, jitter, cold-start give-up, and wake-on-visibility. One socket per tab serves the marketing site, the dashboard and the admin panel alike.

So the question is not "where do I add WebSockets" but **"what is still stale, and is a socket the right fix for it?"**

Six candidates, ranked. The first is the big one: it is a structural blind spot, not a missing feature.

| # | Gap | Value | Cost | Status |
|---|-----|-------|------|--------|
| 0 | 33 admin write routes fire no event at all | **Critical** | Low | ✅ **Shipped** |
| 1 | Visitor/learner activity never reaches admins | High | Low | ✅ **Shipped** |
| 2 | Long-running server jobs have no progress channel | High | Medium | Next |
| 3 | Session revocation does not close live sockets | Medium (security) | Low | ✅ **Shipped** (one caveat) |
| 4 | Concurrent-edit collisions in the admin panel | Medium | High | Design decision needed |
| 5 | Multi-instance fan-out (Redis pub/sub) | — | Medium | Prerequisite, not a feature |
| 6 | Search typeahead, cart sync | Low | Medium | **Don't** |

---

## What is already live

Worth stating plainly, so nothing below duplicates it.

**Admin feed** — every call to `recordAudit` in `apps/api/src/modules/audit/audit.service.ts:81` fans out through `announceAuditedChange`. 46 call sites across every module, mapped by action prefix in `apps/api/src/realtime/events.ts`. Publishing a course moves the course list, the audit log and the dashboard counters on every entitled admin's screen.

**Public feed** — the same audit hook maps to coarse channels (`catalog`, `content`, `navigation`, `commerce`, `platform`). An anonymous visitor reading a marketing page is told "the catalogue moved" and re-renders through the public API.

**Learner feed** — announced explicitly rather than derived from audit, because audit records who *acted* and this needs who was *affected*. Three call sites cover it: `enrollments.service.ts:147,168`, `progress.service.ts:208`, `ecommerce.service.ts:401,549`. Completing a lesson in one tab moves the dashboard in another.

The design rule that makes all of this safe: **events name, they do not carry.** A notice says which area went stale; the client refetches through the endpoint it always used. Every proposal below must keep that rule.

---

## 1. Visitor and learner activity is invisible to admins

**This is the largest gap in the system, and it is structural.**

The entire admin live feed is derived from `recordAudit`, and `recordAudit` fires only on administrator-initiated writes. `apps/api/src/routes/public.routes.ts` contains **zero** calls to it. So every one of these produces a live update for the *learner* and nothing at all for the *admin*:

| What happens | Learner told? | Admin told? | Where |
|---|---|---|---|
| Learner self-enrolls in a course | ✅ | ❌ | `enrollments.service.ts:147` |
| Learner completes a lesson | ✅ | ❌ | `progress.service.ts:208` |
| Checkout creates an order | ✅ | ❌ | `ecommerce.service.ts:401` |
| Payment webhook clears an order | ✅ | ❌ | `ecommerce.service.ts:549` |
| Visitor submits the contact form | — | ❌ | `public.routes.ts:454` |
| Visitor subscribes to the newsletter | — | ❌ | `public.routes.ts:468` |

An admin watching `/admin/orders` during a sale sees nothing until they reload. The dashboard's `overview` counters — enrollments, revenue, signups — are exactly the numbers that move from visitor traffic, and they are the ones that never update live. The feed is currently a mirror of *admin activity*, when what an admin most wants to watch is *user activity*.

**Also missing entirely:** there are API routes at `admin.routes.ts:1600` (`/contact-messages`) and `:1625` (`/newsletter-subscribers`), but no admin UI reads them — grepping for either string in `apps/web/src` returns nothing. The inbox exists on the server and has no screen.

### The fix

One new function beside the two that exist, in `apps/api/src/realtime/events.ts`:

```ts
/**
 * Announces something a *visitor* did, to the admins entitled to see it.
 *
 * The counterpart to announceAuditedChange: that one carries deliberate
 * administrative changes, this one carries the activity an administrator is
 * actually watching for. Not audit-derived, because a learner enrolling is not
 * an audited administrative act — and should not become one, or the audit log
 * stops being a record of who exercised authority.
 *
 * No actor is sent. An admin with `enrollments.read` learns that enrollments
 * moved and refetches the list, which is already scoped to what they may read.
 */
export function announceVisitorActivity(resources: RealtimeResource[]): void {
  broadcastChange({
    resources: [...new Set([...resources, REALTIME_RESOURCES.OVERVIEW])],
    action: 'activity',
    targetType: null,
    targetId: null,
  });
}
```

Then six call sites, next to the `announceLearnerChange` calls that already exist there:

- `enrollments.service.ts` enroll/cancel → `['enrollments', 'courses']`
- `progress.service.ts` on `justCompleted` only → `['enrollments']`
- `ecommerce.service.ts` createOrder / updateOrderStatus → `['orders', 'products']`
- `public.routes.ts` contact → a new `messages` resource
- `public.routes.ts` newsletter → the same `messages` resource

### Watch out for

**Volume.** Lesson-completion is the risky one — a busy platform fires it constantly, and `broadcastChange` walks every subscriber. Gate it on the `justCompleted` transition (`progress.service.ts:191` already computes it) so re-marking a lesson is silent, and consider coalescing on the server before it reaches the socket. Everything else is human-paced and safe.

**Audit purity.** Do not solve this by calling `recordAudit` from public routes. The audit log is a record of who exercised authority; filling it with visitor traffic destroys that and floods `/admin/audit-logs`.

**The `messages` resource** needs a new entry in `REALTIME_RESOURCES`, a permission in `REALTIME_RESOURCE_PERMISSION` (`packages/types/src/realtime.ts:80,104`) and a prefix in `ADMIN_QUERY_PREFIXES` (`realtime-provider.tsx:47`) — the record types make all three fail to compile if you forget one, which is the intended safety net.

---

## 2. Long-running server work has no progress channel

Two operations block on an HTTP request with nothing but a spinner:

**PDF extraction** — `apps/api/src/modules/content/pdf-import.service.ts:283` parses a whole PDF through `pdfjs-dist` inside the `/admin/content/pdf/preview` request. A 200-page document is a long, silent wait; `apps/web/src/components/admin/pdf-import-modal.tsx` can show a `Loader2` and nothing else. There is no page count, no ETA, no way to tell a slow parse from a hung one.

**Media upload** — `MAX_UPLOAD_MB` defaults to 25 (`config/env.ts:111`) and allows up to 500. `media-client.tsx` has no upload-progress handling, and `lib/api/client.ts` uses `fetch`, which cannot report upload progress at all.

### The fix — and the important split

These need *different* solutions, and conflating them is the common mistake.

**Upload byte-progress is not a WebSocket problem.** The bytes are travelling on the HTTP request itself; the server knows nothing the browser does not already know. Swap `fetch` for `XMLHttpRequest` in the upload path and read `xhr.upload.onprogress`. No socket involved.

**Server-side work after the bytes land is a WebSocket problem** — PDF parsing, thumbnail generation, page extraction. Only the server knows how far along it is.

That calls for a distinct event type:

```ts
export interface RealtimeJobEvent {
  type: 'job.progress';
  jobId: string;
  kind: 'pdf-import' | 'media-process';
  /** 0–100, or null while indeterminate. */
  percent: number | null;
  stage: string;
  done: boolean;
  error: string | null;
}
```

Delivered through the existing `broadcastToUser` path — a job belongs to the account that started it, and the learner audience already matches on `userId` (`hub.ts:449`). No new authorization surface. The client correlates on a `jobId` returned by the POST that starts the work.

### Watch out for

**This changes the shape of the endpoint.** Progress only helps if the request returns *immediately* with a `jobId` and the work continues in the background. That means an in-process job registry, and results that survive long enough for the client to collect them. Right now `extractPdfContent` returns the whole extraction as the response body.

**It bends "events name, they do not carry"** — deliberately, and that is acceptable here, because progress is not data the viewer could read another way. Keep the payload to progress metadata; the *result* must still be collected through an authorized endpoint.

**In-process jobs die with the instance.** A deploy mid-parse leaves the client waiting forever. Give jobs a TTL and have the client time out.

---

## 3. Session revocation does not close live sockets

A socket authenticates once at the handshake and closes when the access token expires (`hub.ts:377`) — which is correct but slow. Two cases sit inside that window:

- A user revokes another device at `account.routes.ts:301`. That device's socket stays open and keeps receiving that account's learner events until the token expires.
- An admin suspends an account. `hub.ts:307` checks `SUSPENDED`/`INACTIVE` at handshake — but an *already-open* socket is never re-checked.

The exposure is small (learner events carry topic names, not data) but the fix is nearly free and the property is worth having exactly.

### The fix

A `disconnectUser(userId, reason)` export in `hub.ts` that walks `subscribers` and closes the matching ones with `REALTIME_CLOSE.FORBIDDEN` — which the client already treats as final and does not retry (`client.ts:214`). Call it from session revocation, from user suspension, and from role changes that drop permissions.

For a *narrowed* rather than revoked role, closing is still the right move: the socket reconnects and re-resolves permissions from the database at the new handshake. That is simpler and more correct than mutating a live subscriber's permission set.

---

## 4. Concurrent editing has no collision signal

`page-builder.tsx`, `course-editor.tsx`, `lesson-editor.tsx` and `collection-entry-editor.tsx` are all last-write-wins. Two admins on the same course silently overwrite each other. The live feed makes this *more* visible without helping: the second admin's screen refetches mid-edit because the first one saved.

A presence channel — "Dana is editing this page" — is the classic WebSocket use case, and this is the only candidate here that genuinely cannot be done any other way.

### The cost, stated honestly

Presence requires the client to **send** — "I am on `/admin/courses/abc`" — and `hub.ts` is explicitly built as a one-way channel. From its own header comment:

> *A command channel.* The only message the server accepts from a client is `pong`. Every write still goes through the HTTP API, with its validation, rate limits and audit trail intact.
>
> *A subscription protocol.* A client cannot ask to be told about anything; it is told what its audience entitles it to. There is nothing to send that could widen a socket's reach.

Presence breaks both. That is not a reason to refuse it, but it is a real architectural decision rather than a feature addition, and it needs its own guards: validate the announced route server-side, rate-limit presence messages, and make certain a presence claim can never widen what a socket receives.

### A cheaper 80% first

Optimistic concurrency, no socket needed: send the record's `updatedAt` with the save, reject with `409` if it moved, and show "someone else saved this — reload". That converts silent data loss into a visible, recoverable error. Do this regardless of whether presence ever gets built; presence prevents the collision, but only the version check makes losing work impossible.

---

## 5. Multi-instance fan-out (prerequisite, not a feature)

The subscriber registry is a process-local `Set` (`hub.ts:98`). Already documented as a known limit in `docs/architecture.md:264` and in the hub's own header. With two API instances behind a load balancer, a change on A does not reach a client on B — and those pages silently fall back to refreshing on navigation, which looks exactly like a bug to whoever reports it.

`render.yaml` currently runs a single API instance, so this is not yet biting. It becomes urgent the moment that changes, and everything proposed above makes it *more* urgent by putting more weight on the feed.

The fix is contained: publish the three broadcast functions over Redis pub/sub and subscribe on each instance. No call site changes — `broadcastChange`, `broadcastPublic` and `broadcastToUser` keep their signatures. Note that `lib/cache.ts` and the rate limiter have the same single-instance assumption, so this is one decision, not three.

---

## 6. Where a WebSocket is the wrong answer

Listed so they are ruled out on purpose rather than by omission.

**Search typeahead.** `search-dialog.tsx:70` debounces at 250ms over HTTP. A socket would save the handshake, but the query already runs against Postgres and that dominates. Debounce plus HTTP caching is the better lever.

**Cart sync across devices.** `lib/cart-store.ts` is Zustand in `localStorage`. Syncing it live would need server-side carts — a real feature with real cost, and the payoff is a case (same person, two devices, mid-purchase) that is rare. The `commerce` public channel already handles the case that matters: a price or stock level changing under a loaded cart.

**Video position on the learn page.** `learn-shell.tsx` posts progress on explicit completion, not on a timer. There is no chatty polling loop here to replace.

---

## What shipped

### Item 0 — the 33 admin routes that told nobody

**Found after the original audit, and it outranked everything in the table.** Of 80 admin write endpoints, only 46 called `recordAudit`. Since that hook is the *only* thing driving the feed, the other 33 changed the database and announced nothing — not to admins, not to the public site, and not to the audit log either. The same missing call caused both.

The worst of them were the ones nobody would suspect: toggling a menu item's `isVisible` — the switch that decides what appears in site navigation for every visitor — was completely silent, as were all six footer operations, blog create/edit/delete, every course-module operation, and instructor management. Deleting a blog post left no record of who did it.

The fix was mostly wiring rather than design: `realtime/events.ts` *already* mapped the `menu`, `blog`, `instructor`, `module` and `section` prefixes to both admin resources and public channels. The routing had been written expecting these actions; only the `recordAudit` calls were missing. 33 new `AUDIT_ACTIONS` constants and 33 route calls.

Two decisions worth recording:

- **Footer actions carry the `menu.` prefix** (`menu.footer_group_created`, etc.) rather than a prefix of their own. The footer *is* navigation — it shares the `menus` resource and the `navigation` public channel — so a separate prefix would only mean a second mapping that always had to agree with the first.
- **`seo` needed a new resource.** It was the one prefix with nowhere to go: `/admin/seo` is its own screen behind `SEO_MANAGE`, so it became `REALTIME_RESOURCES.SEO` rather than being folded into `pages`. An editor who may rewrite a page's body should not necessarily be told its canonical URL changed.

`POST /content/pdf/preview` is left silent deliberately — it writes nothing, so auditing it would fill the log with non-changes and refresh screens that had not gone stale.

**Coverage now: 79 of 80 audited, 1 intentionally silent.**

### Item 1 — visitor activity now reaches admins

`announceVisitorActivity()` in `realtime/events.ts`, beside the two functions that were already there. It carries no actor and no target id, for the same reason the public channels carry none: an admin learns that a list moved and refetches it through the endpoint that already scopes it. A learner completing a lesson does not put that learner's name on every open dashboard.

Wired at five points, each gated so nothing double-broadcasts with the audit trail:

| Call site | Announces | Gate |
|---|---|---|
| `enrollments.service.ts` enroll | `enrollments`, `courses` | skipped when `source: 'admin'` — that path is audited |
| `enrollments.service.ts` cancel | `enrollments`, `courses` | learner-only path, no gate needed |
| `progress.service.ts` | `enrollments` | **only on the `justCompleted` transition** |
| `ecommerce.service.ts` createOrder | `orders`, `products` | guest checkout included |
| `public.routes.ts` contact + newsletter | `messages` | — |

`updateOrderStatus` was **not** wired, contrary to the plan above: it is reachable only from an admin route that already calls `recordAudit`, so it was already live.

The new `messages` resource is gated on `PERMISSIONS.SETTINGS_MANAGE` — deliberately the same permission that guards both inbox endpoints, so a socket can never be told about a screen its holder could not open.

**And the screen it lights up.** `/admin/messages` did not exist; the endpoints had no UI at all. It is now a two-tab inbox (messages, subscribers) with a `PATCH /admin/contact-messages/:id` behind it to mark a message handled — audited, because clearing a shared queue *is* an administrative act, and going through `recordAudit` means the other admins reading the same inbox are told live with no extra call.

### Item 3 — sessions now take the socket with them

`disconnectUser(userId, reason)` and `disconnectUsers(userIds, reason)` in `hub.ts`, closing with `REALTIME_CLOSE.FORBIDDEN` so the client treats it as final and does not reconnect in a loop.

Hung off `tokenVersion`, which was already this codebase's single account-wide invalidation signal. Every site that bumps it now hangs up too:

- `users.service.ts` — suspension, email change, role assignment, both deletion strategies
- `roles.service.ts` — `invalidateSessionsForRole`, via `disconnectUsers`
- `auth.service.ts` — logout-everywhere, password reset, password change, refresh-token reuse detection

For a *narrowed* rather than revoked role, closing is still right: the reconnect re-resolves permissions from the database through the same path the first handshake took, rather than growing a second implementation of the same rule in the subscriber set.

**The caveat — a correction to the analysis above.** Revoking a *single* device at `account.routes.ts:301` was **not** wired, and the reason matters. An access token carries `{ sub, ver }` and no session identifier, so the hub cannot tell one of an account's sockets from another; `disconnectUser` would close the laptop doing the revoking along with the phone being revoked. More to the point, single-session revoke does not bump `tokenVersion` — it only stops the *refresh* — so that device keeps full HTTP access until its access token expires anyway. The socket outliving it is consistent with the HTTP behaviour, not a realtime-specific hole. Closing it properly means putting a session id in the access token and matching on it at the handshake, which is a change to the auth contract rather than to the hub.

**Tests.** Four added, all passing (100 total, 0 failures). They pin the boundaries rather than the delivery: that visitor activity never crosses to an anonymous socket, that `disconnectUser` leaves account-less sockets alone, that an empty id list is not read as "everyone", and that the support inbox emits nothing on the public feed.

---

## Recommended order

1. ~~**`announceVisitorActivity`**~~ — done, with the `/admin/messages` screen it needed.
2. ~~**`disconnectUser`**~~ — done, on every `tokenVersion` bump. Single-session revoke deferred; see the caveat above.
3. **Optimistic-concurrency `409`s** on the editors — no socket needed, stops silent data loss. ← *next*
4. **Job progress** for PDF import, with the XHR upload-progress fix as its own separate change.
5. **Redis pub/sub**, before the second API instance exists rather than after.
6. **Presence**, only if concurrent editing turns out to be a real complaint — and only with the command-channel guards designed first.
