# Security audit

Run 26 August 2026 against the 17 categories in
[benavlabs/vibe-check](https://github.com/benavlabs/vibe-check), then acted on.

Every result below was measured against the running code, a production build, or
the database, not read off the source and assumed. Where a category asks a
question this project answers differently by design, the reasoning is recorded
rather than the category marked PASS and forgotten.

## Results

| #   | Category         | Before | After     | What changed                                      |
| --- | ---------------- | ------ | --------- | ------------------------------------------------- |
| 1   | SECRETS_EXPOSURE | PASS   | PASS      |                                                   |
| 2   | DATABASE_ACCESS  | LOW    | PENDING   | RLS migration written; applies on the next deploy |
| 3   | AUTH_MIDDLEWARE  | PASS   | PASS      |                                                   |
| 4   | ACCESS_CONTROL   | PASS   | PASS      |                                                   |
| 5   | FRONTEND_SECRETS | PASS   | PASS      |                                                   |
| 6   | SSRF             | N/A    | N/A       | Nothing fetches a user-supplied URL               |
| 7   | CSRF             | LOW    | PASS      | Secure flag on every session cookie               |
| 8   | SECURITY_HEADERS | MEDIUM | PASS      | Content-Security-Policy, public and admin         |
| 9   | CORS             | PASS   | PASS      |                                                   |
| 10  | RATE_LIMITING    | MEDIUM | PASS      | Auth budget counted in Postgres, not per process  |
| 11  | SQL_INJECTION    | PASS   | PASS      |                                                   |
| 12  | XSS              | PASS   | PASS      |                                                   |
| 13  | PAYMENT_WEBHOOKS | N/A    | N/A       | No payments yet                                   |
| 14  | FILE_UPLOADS     | PASS   | PASS      | Uploads renamed to an unguessable filename        |
| 15  | ERROR_HANDLING   | PASS   | PASS      |                                                   |
| 16  | PASSWORD_HASHING | PASS   | NOT MOVED | Payload hardcodes PBKDF2; see below               |
| 17  | DEPENDENCIES     | LOW    | PASS      | 9 advisories down to 4, none reaching the site    |

Category 2 is written and verified safe but not yet applied: it lands when
`pnpm --filter @vardenia/web migrate` is run against production, which happens
with the next deploy. Until then production still reports RLS off. One grant
inside that category could not be removed at all; both are described below.

## What changed, and how each was verified

### 7. The session cookie now carries Secure

`lib/auth-cookies` sets `{ sameSite: 'Lax', secure: NODE_ENV === 'production' }`
on all three auth collections. Keyed off the environment because a Secure cookie
is discarded over plain http, so hardcoding it would break local development
including the admin panel.

Verified by building the sanitised Payload config under both NODE_ENV values and
reading the value each collection ends up with, rather than by grepping for the
constant: a collection that imports it and never applies it still fails.

### 8. There is a Content-Security-Policy

Two policies, in `lib/security-headers`. The public one names where a script may
send data, blocks framing entirely, pins the base URI, and stops off-origin form
posts. The admin one allows `unsafe-eval`, which Payload's panel needs, and keeps
everything that does not depend on how that panel is built.

`script-src` still allows `unsafe-inline`. The strict alternative is a
per-request nonce, which forces every page to render dynamically, and static
rendering here is load-bearing. The clauses that survive without a nonce are the
ones that stop an injection escalating or exfiltrating, which is a real
reduction rather than a pretence of prevention.

The public source is a negative lookahead so no path is ever served two
policies; a path that gets two receives the intersection, which would silently
apply the public script rules to the admin panel.

Verified with 19 assertions, plus a wire check against a production build:
exactly one policy header on `/` and on `/admin`, admin allows eval and public
does not, browser console clean on the home page, directory, a section page and
the sign-in page, and the admin login form still renders. An eval violation seen
during this work turned out to be dev-mode React Refresh and does not occur in a
build.

### 10. The auth rate limit is shared

The counter for the tight auth budget moved from a module-level Map into
Postgres, as a single atomic upsert that rolls the window inside the same
statement. Read-add-write would have had the same lost-update bug as the scan and
error counters, except here a lost update means letting through an attempt that
should have been refused.

Only the auth budget uses it. Putting a round trip in front of every API request
would cost more than it protects, and on this deployment a round trip is about
200ms.

It fails open. A database that cannot answer falls back to the in-memory count
and says so once on the console. A limiter that turns a database outage into
"nobody can sign in, including the staff who would fix it" has made things worse.

Verified by spending the budget in one process, exiting it completely, and
asking a second cold process for one more attempt: it was refused. A per-instance
limiter cannot produce that result. A different caller, also cold, was allowed,
so the check is not simply refusing everything.

### 14. Uploads get an unguessable name

`hooks/unguessableFilename` renames every upload before it is stored: the
original stem, slugified and clipped, plus 96 bits of randomness. Not a bare
UUID, because these names appear in image URLs a designer has to match against a
layout, and the entropy is in the suffix either way.

Everything in the bucket is public by intent, so this is hardening rather than a
fix for a live leak. It stops being that the first time somebody uploads a signed
contract to the same collection.

Verified by uploading a real PNG through Payload and reading the stored filename,
not only by testing the naming function. The stored extension is `.webp` rather
than the `.png` that went in, because the collection sets `formatOptions` and
sharp re-encodes; the check asserts the suffix and a plausible image extension.

### 17. Dependencies

`vitest` to `^3.2.6` and a `vite` override at `^6.4.3`. That clears the critical
and both highs that reached the website. Nine advisories are now four:

| Severity | Package    | Reaches     | Fix             |
| -------- | ---------- | ----------- | --------------- |
| high     | image-size | apps/mobile | none exists     |
| high     | image-size | apps/mobile | none exists     |
| moderate | esbuild    | apps/web    | build time only |
| moderate | uuid       | apps/mobile | unreachable     |

`image-size` and `uuid` arrive only through the Expo mobile app's bundler, which
is not deployed and is not part of the website. The earlier version of this
document said those were in the web tree; that came from a workspace-wide
`pnpm why` and was wrong.

The upgrade needed no config changes. 1191 assertions pass on the new versions.

## Category 2, and the one grant that could not be removed

Row level security is now enabled on all 45 tables in the `payload` schema, by a
hand-written migration.

It changes nothing about how the application queries, and that was checked before
it was written: the connection role is `postgres`, which owns every table, has
`rolbypassrls`, and no table sets FORCE. RLS is invisible to Payload twice over.
Verified afterwards by confirming all 45 tables have it on, the role still
bypasses, no table forces it, and Payload can still read listings and complete a
write.

**It only holds in production, and that is not a caveat, it is the design.**
Drizzle push reconciles the schema against the collection definitions, RLS is
not part of those, so push resets it. Measured: after applying the migration to
the development database, a single Payload boot in development mode took all 45
tables from RLS on to RLS off. Production sets `push: NODE_ENV !== 'production'`
and therefore never runs it, so the migration's effect persists exactly where it
matters. Development and CI will keep losing it on every boot, which is why the
verification for this points at production.

No policies were written. The checklist asks for policies scoped to
`auth.uid()`, and there is no Supabase Auth here: Payload owns identity, and
`auth.uid()` is null for every connection this application makes. RLS with no
policy denies by default, which is stricter and more honest than a policy that
reads as protection and is not.

**The `public.spatial_ref_sys` grants remain.** `anon` holds INSERT, UPDATE,
DELETE and TRUNCATE on PostGIS's coordinate reference table. The migration issues
the REVOKE, and it does nothing: the grants were made by `supabase_admin`, which
owns the table as part of the extension, and Postgres only removes grants made by
the current role. Running it as `postgres` returns success and changes nothing,
which was confirmed by running it without an exception handler and comparing the
grant list either side.

The exposure is bounded. It needs the anon key, which this codebase never ships
to a browser and never references. `businesses.location` is a real PostGIS
geometry column, so emptying that table would break location writes and any
distance query, which is more than nothing. It needs a session that can become
`supabase_admin`, so it is a support request rather than a code change.

## Category 16, which did not move

Payload hashes with PBKDF2-HMAC-SHA256 and offers no way to change it.
`generatePasswordSaltHash` is a module-level import used by register, login and
resetPassword, and the auth config exposes no hashing option, so meeting the
checklist's wording would mean putting the login path on a private fork of
Payload.

Measured rather than guessed: 25,000 iterations at a 512 byte derived key, which
is 16 output blocks and therefore about 400,000 HMAC operations per hash, against
OWASP's current recommendation of 600,000 for this construction. Same order of
magnitude, and a NIST-approved KDF. Worth revisiting at the next major Payload
upgrade, not worth a fork now.

## The soft 404, found alongside this

Every invented URL answered **200** with the 404 page inside it, so a crawler
would index it as a real page. `notFound()` does not set a status in this
application, measured across several routes. The usual suspect is the middleware
rewrite and it is not the cause: `/ar/nonsense` carries no rewrite header and
behaved identically. What is unusual is that there is no root `app/layout.tsx` -
`(frontend)` and `(payload)` are route groups with separate root layouts, which
changes how the not-found boundary is served.

The middleware now answers a single-segment path that nothing serves with a real
404, using the section list and the route directories as its source of truth. A
test reads the app directory and fails if a route exists that the list does not
know, so it cannot rot into 404ing a real page.

**It does not cover deeper paths.** `/directory/no-such-listing` still answers
200, because deciding it needs a database lookup the middleware has no business
doing. That is the remaining gap.

## What no code audit can answer

The checklist's manual half covers what no code read will find: whether a real
customer can see another customer's booking through the interface, whether the
confirmation email leaks anything, and whether the admin panel is reachable by
somebody who should not have it. Those need a person with two browsers and two
accounts.
