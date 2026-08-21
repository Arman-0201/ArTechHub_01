# Security

This document states what the platform actually defends against, how, and —
just as importantly — what it does not.

The governing principle: **the server is the only place a security decision is
made.** Everything the browser does is under the user's control. Hiding a
button, disabling a field, filtering a list client-side, or obfuscating a
request are user-experience decisions, never controls.

---

## Authentication

### Passwords

Hashed with bcrypt (`bcryptjs`, cost 11). The cost is chosen deliberately:
`bcryptjs` is pure JavaScript — so the platform installs without a native
toolchain — and roughly 3–4× slower than native bcrypt at the same cost.
Cost 11 lands a hash near 400ms, expensive enough that offline cracking is
impractical and cheap enough that the login endpoint is not itself a
denial-of-service vector. With native `bcrypt` available, raising this to 12 is
a strict improvement.

The policy (`packages/validation/src/auth.ts`) requires 10–72 characters with
upper case, lower case and a digit. The upper bound is not arbitrary: bcrypt
silently truncates past 72 bytes, so accepting longer input would create a false
sense of strength.

### Tokens

| Token   | Lifetime | Where it lives                | Storage                      |
| ------- | -------- | ----------------------------- | ---------------------------- |
| Access  | 15m      | JavaScript memory only        | Not persisted anywhere       |
| Refresh | 30d      | HttpOnly, Secure, SameSite cookie | SHA-256 HMAC in the database |

The access token is never written to `localStorage` or `sessionStorage`. An XSS
payload cannot read a persisted credential, and closing the tab leaves nothing
behind.

The refresh token is invisible to JavaScript by construction. Only its keyed
hash is stored — a database leak alone does not yield usable session
credentials, because the HMAC pepper lives in the environment.

Its cookie path is `/`, deliberately. Scoping it to `/api/v1/auth` would keep it
off ordinary API calls, but the browser also decides by path what to send to the
**Next server** — so a narrower scope means server-side rendering receives no
credential at all and every authenticated page bounces to the login screen. Path
scoping was never the control here; `HttpOnly` and `SameSite` are.

### Two credentials, deliberately asymmetric

| Credential | Authenticates | Used by |
| --- | --- | --- |
| Bearer access token | any request, including writes | the browser |
| Refresh cookie | `GET` and `HEAD` only | server-side rendering |

The Next server holds cookies but never the access token, which lives in browser
memory — so without cookie authentication it could not render a single
authenticated page.

Restricting the cookie to safe methods is what keeps this from being a CSRF
hole. `SameSite=Lax` already blocks cross-site writes; and for a cross-site
top-level GET navigation, the attacker's page cannot read the response. So
cookie-authorised **reads** are not exploitable, while cookie-authorised
**writes** would be a real surface. Writes stay bearer-only, and three
integration tests pin that down — including one asserting that a mutation
attempted with only the cookie is refused and leaves the record unchanged.

Cookie authentication grants no extra authority: permissions are resolved
identically either way, so a learner's cookie still gets 403 on an admin route.

Access-token claims are deliberately minimal: subject, a token version, and a
type. **Permissions are not in the token.** They are loaded from the database on
every request, so revoking a role takes effect on the next request rather than
at the next token expiry.

`User.tokenVersion` is the kill switch. Incrementing it invalidates every
outstanding access token for that user at once. It is bumped on logout-all,
password change, password reset, email change, role change, status change, and
refresh-token reuse detection.

### Refresh rotation and reuse detection

Every refresh revokes the presented token and issues a new one in the same
family. Presenting an already-revoked token means either a replay or a theft —
in both cases the response is the same: revoke the entire family and bump
`tokenVersion`, forcing a fresh login everywhere.

This is covered by an integration test that asserts a consumed token fails
**and** that the legitimately rotated token is killed alongside it.

### Account enumeration

Login answers identically for an unknown address and a wrong password, and
spends comparable time doing so (`fakePasswordVerification` burns an equivalent
bcrypt round when no account exists, so response latency does not leak).

Forgot-password, resend-verification and OTP request all return the same success
message regardless of whether the address exists.

Registration is the exception that cannot be closed — the user has to be told
the address is taken — so the message is generic and the endpoint is rate
limited to 5 per hour per IP.

### Lockout

Eight consecutive failures locks the account for 15 minutes. This complements
rather than replaces the rate limiter: the limiter stops one host spraying many
accounts, the lockout stops a distributed attack grinding one account.

### OAuth

The authorization-code flow runs entirely server-side. The client secret and the
exchanged tokens never reach the browser; the browser only ever receives the
resulting session cookie.

The `state` parameter is an HMAC-signed, short-lived payload carrying the
post-login redirect. The signature is what makes the callback CSRF-resistant.
The redirect is validated twice — when the state is signed and when it is
consumed — and only site-relative paths are honoured, so the callback cannot
become an open redirect.

An account is linked to an existing local account **only when the provider
reports the email as verified**. Linking on an unverified provider email would
let an attacker take over an account by registering that address at the
provider. The access token is never placed in a URL, where it would land in
browser history, server logs and referrer headers.

---

## Authorization

Two independent layers, both server-side.

`requireAdminAccess` gates the admin area as a whole — the caller must hold at
least one admin permission. `requirePermissions(...)` gates each route on the
specific capability.

The permission *catalogue* is code-defined (`packages/types/src/permissions.ts`).
Roles are created and edited at runtime, but they can only hold permissions that
exist in the code — a role can never grant something no middleware checks.

Super Admin bypasses individual permission checks by design, and its permission
set cannot be edited. This is the escape hatch that stops an operator locking
the platform out of its own admin panel.

### Object-level authorization

Permission checks answer "may this person do this kind of thing". Ownership
checks answer "is this theirs". Both are required, and the second is where most
real-world breaches happen.

Ownership is part of the query, not a check afterwards:

```ts
// Wrong: any authenticated user can read any order.
const order = await prisma.order.findUnique({ where: { id } });

// Right: ownership is a condition of the lookup.
const order = await prisma.order.findFirst({ where: { id, userId } });
```

Where this is enforced:

- Every `account` route derives its subject from `req.user.id`, never from input
- `getOrderForUser` scopes by `userId`
- Session revocation is scoped to the caller's own sessions
- Lesson access checks enrollment, publication and expiry
- Progress writes call `assertEnrolled` first
- Reordering verifies every id belongs to the parent before writing anything

### Privilege-escalation guards

- Only a Super Admin can grant the Super Admin role
- A non-Super-Admin cannot edit, demote or delete a Super Admin
- The last active Super Admin cannot be removed or demoted
- System roles cannot be deleted
- A role still assigned to users cannot be deleted
- A permission change bumps `tokenVersion` for every holder

---

## Input validation

Every request body, query string and route parameter is validated with Zod
before any handler runs. Parsed output replaces the raw input, so downstream
code works with coerced, trimmed, defaulted values and cannot accidentally read
an unvalidated field.

The schemas live in `packages/validation` and are used by both the API and the
web forms, so the two cannot drift. Client-side validation is for feedback
speed; the server validates independently and its field errors are mapped back
onto the inputs.

Specific defences worth naming:

| Rule                                    | Prevents                                       |
| --------------------------------------- | ---------------------------------------------- |
| Sort fields checked against an allowlist | Query manipulation through the `sort` parameter |
| Page size capped at 100                 | One request pulling an entire table             |
| Slugs restricted to `[a-z0-9-]`         | Path traversal through URL segments             |
| URLs restricted to http(s)/relative     | Stored `javascript:` and `data:` links          |
| Unknown rich-text nodes rejected        | The renderer meeting a node it cannot handle    |
| Body size capped at 1MB                 | Memory exhaustion from large payloads           |

SQL injection is structurally prevented: all database access goes through
Prisma's parameterised query builder. There is no raw SQL with interpolation
anywhere in the codebase.

---

## XSS

Three layers, in order of importance:

**1. There is almost no HTML path.** Lesson and article bodies are a structured
JSON tree rendered node-by-node into React elements. Text is rendered as text.
There is nowhere to put a `<script>`.

**2. The one HTML path is sanitised on write.** The HTML section type runs
through an allowlist sanitiser (`lib/sanitize.ts`) *before it is stored*, not
only on render — so a payload never survives long enough to reach a renderer
that might forget to escape it. Scripts, iframes, objects, forms, every `on*`
attribute and every non-http(s) URL scheme are dropped. The allowlist approach
is deliberate: a denylist of dangerous tags cannot win against the number of
encodings and parser quirks available.

**3. Defence in depth.** A Content-Security-Policy restricts script sources and
limits `connect-src` to the API origin, so injected script cannot exfiltrate to
an arbitrary host. Session tokens are in HttpOnly cookies, so a successful XSS
cannot read them.

`dangerouslySetInnerHTML` appears exactly twice in the web app: the HTML section
(server-sanitised content) and the JSON-LD emitter (machine-generated JSON with
`<` escaped so it cannot terminate the script element early).

---

## CSRF

The API is token-authenticated: an ordinary request needs an `Authorization`
header, which a cross-site form post cannot set. The refresh cookie is the only
ambient credential, and it is `SameSite=Lax` and path-scoped to the auth routes.

CORS is an allowlist, never a reflector — `credentials: true` combined with a
reflected origin would let any site drive an authenticated request.

For a cross-site deployment (`SameSite=None`), add a double-submit CSRF token to
the refresh endpoint.

---

## File uploads

The declared `Content-Type` is treated as a hint and nothing more; it is fully
attacker-controlled. The real type is derived from the file's magic bytes
(`file-type`) and only then checked against an allowlist.

| Control                          | Detail                                                |
| -------------------------------- | ----------------------------------------------------- |
| Type verification                | Magic bytes, not the declared header                   |
| Allowlist                        | Images, PDF, video, audio, common documents            |
| **SVG excluded**                 | It is XML that can carry script — stored-XSS vector    |
| Size cap                         | `MAX_UPLOAD_MB` (25 by default); 2MB for learner avatars |
| Server-generated filenames       | Random bytes; the client's filename is never a path    |
| Storage key validation           | Strict pattern check before any filesystem or S3 call  |
| Kind restriction                 | Narrower callers (avatars) restrict to `IMAGE`         |
| Nothing written before validation | The object is stored only after the type is accepted   |
| Response headers on local uploads | `X-Content-Type-Options: nosniff` and a sandbox CSP    |

Learners hold no media permissions. Their avatar upload is a deliberately
narrower door: one file, images only, a 2MB cap, a fixed folder — and the
returned id is re-verified before it is attached to a profile.

Deletion is refused while anything still references a file, so removing an image
cannot silently break a course page.

---

## Rate limiting

| Endpoint            | Window | Limit | Keyed on                                 |
| ------------------- | ------ | ----- | ---------------------------------------- |
| Global              | 1m     | 300   | IP                                       |
| Login               | 15m    | 10    | IP + submitted email                     |
| Registration        | 1h     | 5     | IP                                       |
| Password reset      | 1h     | 5     | IP                                       |
| OTP                 | 15m    | 8     | IP                                       |
| Email verification  | 1h     | 10    | IP                                       |
| Refresh             | 15m    | 60    | IP                                       |
| Upload              | 1h     | 100   | IP                                       |
| Public forms        | 1h     | 10    | IP                                       |
| Search              | 1m     | 60    | IP                                       |

Login is keyed on IP **and** email so that one attacker cannot lock out a
victim's account from many IPs, and one IP cannot spray many accounts.

**Limitation:** the store is in-process. This is correct for a single instance
and for development. A multi-instance deployment multiplies every limit by the
instance count — swap in a Redis store (`rate-limit-redis`) in
`middleware/rate-limit.ts`; the limiter definitions do not change.

`TRUST_PROXY` must be enabled behind a load balancer or every limit keys on the
balancer's IP and applies globally. It must **not** be enabled otherwise, since
`X-Forwarded-For` is then client-controlled and can be used to evade limits.

---

## Security headers

Set by Helmet on the API and by `next.config.mjs` on the web app.

| Header                    | Value                                                    |
| ------------------------- | -------------------------------------------------------- |
| `Content-Security-Policy` | Restrictive; `connect-src` limited to the API origin      |
| `X-Content-Type-Options`  | `nosniff`                                                 |
| `X-Frame-Options`         | `DENY` (plus `frame-ancestors 'none'`)                    |
| `Referrer-Policy`         | `strict-origin-when-cross-origin`                         |
| `Permissions-Policy`      | Camera, microphone, geolocation denied                    |
| `Strict-Transport-Security` | 1 year with subdomains, production only                 |

The production CSP omits `'unsafe-eval'`; it is present only in development,
where React Refresh requires it. `'unsafe-inline'` on styles is required by
Next's inlined critical CSS.

---

## Logging and audit

Structured logs (pino) with a redaction list applied before anything is written,
so a stray `logger.info({ body })` cannot leak a password or a bearer token.
Passwords, tokens, hashes, OTP codes and client secrets are all redacted.

Security-relevant events go to a dedicated channel: failed logins, lockouts,
token reuse detection, permission denials, rejected uploads, rate-limit trips.

The audit log records who did what to which object, for the operations where
that matters — role changes, deletions, publishes, settings and feature changes.
Actions are fixed strings, not free text, so the history stays filterable. It is
append-only and contains no credentials.

An audit write never throws: a failed audit entry must not roll back the
operation the administrator actually performed. Failures are logged loudly
instead.

---

## Data protection

User deletion offers three explicit strategies rather than one destructive
default, because deleting a learner destroys progress and legal-acceptance
records:

- **Deactivate** — reversible; the account simply cannot sign in
- **Anonymize** — irreversible; identifiers scrubbed, learning statistics
  survive in aggregate. This is the GDPR erasure path
- **Purge** — full hard delete, Super Admin only, for genuine mistakes

Legal documents are versioned, and acceptance is recorded against a specific
version with a timestamp and IP. Publishing a new version leaves historical
acceptances intact and auditable.

---

## Environment and secrets

Configuration is validated at boot. The process refuses to start on a bad
config — a half-configured server is worse than one that will not run.

In production it additionally refuses to start when:

- any secret still contains a placeholder marker
- the access and refresh secrets are identical
- `COOKIE_SECURE` is off
- `SameSite=None` is set without `Secure`
- `CORS_ORIGINS` is empty
- `STORAGE_DRIVER=s3` without bucket credentials
- `MAIL_TRANSPORT=console`

No secret is committed. `.gitignore` excludes every `.env` except the example.

---

## What this does not do

Stated plainly, because a security document that only lists strengths is
misleading:

- **Rate limiting is per-instance.** Scale horizontally and every limit
  multiplies. Use a shared store.
- **No malware scanning.** Uploaded files are type-verified, not scanned.
  `lib/storage.ts` is where a ClamAV or provider-side scan would hook in.
- **No 2FA.** OTP exists as an email-based login mechanism, not as a second
  factor on top of a password. TOTP enrolment would be a genuine addition.
- **No CAPTCHA.** Public forms are rate limited only. A determined bot at low
  volume will get through.
- **No automated dependency scanning in CI.** Run `npm audit` and enable
  Dependabot.
- **Payments are not implemented.** Orders are provider-agnostic and no card
  data is collected or stored. Integrating a gateway brings PCI scope with it.
- **No brute-force protection on OTP beyond 5 attempts per code** and the
  endpoint rate limit.
- **Search is `ILIKE`-based.** Correct and injection-safe, but it will not scale
  to millions of rows. `search.service.ts` is the seam for a real engine.

### Explicitly rejected

**Hiding API requests from DevTools is not a security model.** Any request the
browser makes can be inspected, replayed and modified. Obfuscating, encoding,
minifying or encrypting client-side traffic provides no protection — whatever
the client can decrypt, so can whoever is running it.

The controls that work are the ones in this document: server-side
authentication, server-side authorization including ownership, server-side
validation, rate limiting, secure token handling, and audit.

---

## Reporting

Security issues should be reported privately to the address in the platform's
contact settings, not through a public issue tracker.
