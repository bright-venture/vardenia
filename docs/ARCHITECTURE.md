# Vardenia - Architecture

## The shape of the problem

Vardenia is not a website with an app bolted on. It is **one content spine feeding four
surfaces**, where the surfaces have very different lifecycles:

| Surface          | Changes          | Lifecycle                                    |
| ---------------- | ---------------- | -------------------------------------------- |
| Print magazine   | Twice a year     | **Immutable once printed.** Lives ~12 months |
| Website          | Continuously     | Deploy any time                              |
| Mobile app       | Every few weeks  | App-store review gate, old versions persist  |
| QR / short links | Never (the code) | **Permanent.** Destination is editable       |

Almost every hard constraint in this codebase comes from the two rows in bold. A printed
QR code cannot be changed, and an app version already on someone's phone cannot be
recalled. The architecture is arranged so that neither of those can be broken by a routine
CMS edit.

## Repository layout

```
vardenia/
|-- apps/
|   |-- web/           Next.js 15 + Payload 3 - public site, admin CMS, REST API, QR redirect
|   `-- mobile/        Expo / React Native - consumes the same API
|-- packages/
|   |-- core/          Domain: taxonomy, regions, tiers, QR codes, wire schemas
|   |-- api-client/    Typed API client (mobile + partners)
|   |-- i18n/          Locales, direction, formatting, message catalogues
|   |-- tokens/        Design tokens (colour, type, spacing, motion)
|   `-- tsconfig/      Shared TypeScript configs
`-- docs/              This directory, plus ADRs
```

### Why one Next.js app instead of microservices

At this stage a separate API service, a separate admin, and a separate redirect worker
would be three deployments, three sets of secrets, and three places for the schema to drift

- paid for by a team that does not exist yet. Payload 3 runs inside Next.js, so a single
  deploy gives us the public site, the admin panel, the REST/GraphQL API, and the QR
  redirect, all sharing one type-checked schema.

The seams are drawn so that extraction is cheap when volume justifies it. The QR redirect
is already an isolated route handler with no shared state, and scan logging is already
funnelled through one function.

## The content spine

Payload CMS owns all content, in Postgres. Collections:

| Collection    | Purpose                                              |
| ------------- | ---------------------------------------------------- |
| `businesses`  | The directory listing. The central document.         |
| `qr-codes`    | Permanent short codes with editable destinations.    |
| `scan-events` | Append-only scan log - the evidence behind renewals. |
| `offers`      | Time-limited promotions, gated on listing tier.      |
| `articles`    | Editorial, shared between web and print.             |
| `issues`      | Print editions, with print run and page ranges.      |
| `pages`       | Static marketing pages.                              |
| `media`       | Images and video, with rights tracking.              |
| `users`       | Vardenia staff only. Businesses have no accounts.    |

### Taxonomy is code, not data

Categories (`Hospitality -> Luxury Hotels`) and regions (`Mount Lebanon -> Keserwan`) live in
`packages/core` as TypeScript constants, **not** as CMS documents. They change roughly
never, they must be byte-identical across web, mobile, and print, and a duplicate category
typed by a tired editor is a whole class of bug we get to delete rather than fix.

Consequence: adding a category is a code change and a deploy. That is the right trade for
something that changes twice a year.

### Localization

English and Arabic. Arabic is RTL, which is the reason direction is derived from exactly
one function (`dirFor()` in `@vardenia/i18n`) and never hardcoded. Payload's field-level
localization stores both languages on the same document with English fallback, so a
half-translated listing degrades gracefully instead of rendering blank.

Slugs are deliberately **not** localized - see `apps/web/src/fields/slug.ts` for why.

## The QR layer

This is the commercial heart of the product, so it gets designed like infrastructure rather
than a feature.

```
Printed code  --scan-->  GET /g/:code  --302-->  /directory/:slug
                              |
                              `-- after() --> scan-events row + counter
```

Rules encoded in the system:

1. **Codes are immutable.** `qr-codes.code` rejects updates at the field level.
2. **Destinations are editable.** A rebrand re-points the code; the print run stays valid.
3. **It never 404s.** Unknown codes go to `/scan/not-found`, retired codes to `/scan/moved`.
4. **302, never 301.** A permanently-cached redirect stops reporting repeat scans, and
   repeat scans are what advertisers pay for.
5. **Analytics never block the redirect.** Logging runs in `after()`, post-response.
6. **One code per placement.** Magazine page, window decal, and table tent get separate
   codes - that is the only way to tell an advertiser which placement worked.

Privacy: scan events store city and country only, never precise coordinates and never a
device identifier. The European and GCC audiences this platform courts bring GDPR-shaped
expectations with them, and a tourism guide has no legitimate need for a reader's location
history.

## Access control

Two roles, both Vardenia staff, in `apps/web/src/access/`:

- **staff** - creates and edits all content: listings, offers, articles, issues, pages, media.
- **admin** - all of that, plus identity (accounts), the permanence layer (QR codes, scan
  events) and commercial flags (`tier`, `verified`).

There were four roles at first. The extra two barely changed behaviour, and one documented
difference, "sales cannot publish articles", was never actually enforced. A role that does
not change what someone can do is worse than no role, because it reads as a guarantee
nobody is checking. Split them again when two real people genuinely need different powers,
and enforce the difference in the same commit that introduces it.

**Listed businesses do not get accounts.** Every change to a listing goes through the team.
That is an editorial decision before it is a technical one: a curated title cannot let its
subjects edit their own entries, or the standard drifts to whatever each business wants to
say about itself.

The consequence for this codebase is a large simplification. There is no such thing as a
logged-in outsider, so access control only ever separates two audiences, staff and the
public. No per-record scoping, no ownership graph, no "can this user see this row" logic.

The cost is that listings only stay current if the team keeps them current. That is a
staffing commitment, not a software one, and it should be priced into the editorial
calendar rather than solved later with a self-service portal nobody planned for.

If self-service is ever wanted, it is a new role plus per-record scoping, and it deserves
its own ADR rather than being reintroduced quietly.

On the `Commercial` tab, contract dates, sales owner and internal notes carry field-level
`read: isStaffFieldLevel` and are stripped from every unauthenticated response.

`tier` and `verified` are deliberately public: tier drives result ranking and what the page
renders, and `verified` is a trust badge shown to readers. Both appear in
`packages/core/src/schemas.ts`, which defines what may leave the building separately from
what the database holds.

> A tab's `admin.condition` hides fields in the admin UI **only**. REST and GraphQL keep
> serialising them. Any field that must not be public needs field-level `access.read`.
> This was got wrong once already, and the public API served contract fields until it was
> caught by inspecting an actual response.

> **Not rendering a field does not hide it.** Next.js embeds the data a server component
> fetched into the RSC payload inside the HTML, so a document you loaded but chose not to
> display is still readable with View Source. `issues.printRun` leaked exactly this way:
> the page never printed it, but the whole document was in the markup. On a server-rendered
> page, fetching a field is equivalent to publishing it, and `access.read` is the only thing
> that actually removes it.

## Listing tiers

`packages/core/src/tiers.ts` expresses the commercial model as capabilities, not as
`if (tier === 'premium')` scattered through components. When sales invents a package, it is
added there and the UI follows automatically.

Expired contracts fall back to `free` rather than unpublishing - a lapsed advertiser keeps
a basic presence, and a reason to renew.

## Data flow

```
                     +------------------+
                     |  Payload (CMS)   |
                     |   Postgres +     |
                     |    PostGIS       |
                     `--------+---------+
                              |
              +---------------+----------------+
              |               |                |
     Server Components   REST /api        /g/:code
     (web pages, SEO)   (mobile, partners)  (QR redirect)
              |               |                |
          vardenia.com   Expo app         scan-events
```

Web pages read Payload through the local API (no HTTP hop). Mobile goes over REST through
`@vardenia/api-client`, which validates every response against the shared zod schemas - so
a breaking API change fails loudly in development rather than silently in a build already
shipped to the App Store.

## Geo

Postgres with PostGIS. "Attractions near me" is a spatial query against
`businesses.location`, not a town lookup table. Coordinates are validated against a Lebanon
bounding box on save, which catches the classic transposed lat/lng before it puts a Beirut
hotel in the Mediterranean.

## What is deliberately deferred

- **Payments / advertiser self-serve checkout.** Sales is consultative at this stage; a
  Stripe integration before there are ten advertisers is speculative work.
- **A separate analytics warehouse.** `scan-events` in Postgres is fine into the millions.
  See ADR 0004 for the trigger and the migration path.
- **Shared UI components between web and mobile.** We share tokens, not components. The
  cross-platform component abstraction costs more than it saves at this size.
- **Country editions (Cyprus, Greece, UAE...).** The data model is single-country on purpose.
  See ADR 0005 for what multi-country would cost and when to pay it.

## Related documents

- [`docs/ROADMAP.md`](ROADMAP.md) - build order
- [`docs/adr/`](adr/) - architecture decision records
