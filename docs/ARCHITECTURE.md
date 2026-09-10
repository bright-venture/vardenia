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
|   |-- api-client/    Typed API client (unbuilt - see its index.ts)
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

| Collection       | Purpose                                                        |
| ---------------- | -------------------------------------------------------------- |
| `businesses`     | The directory listing. The central document.                   |
| `qr-codes`       | Permanent short codes with editable destinations.              |
| `scan-events`    | Append-only scan log - the evidence behind renewals.           |
| `bookings`       | Reservations: one interval, one business, capacity-checked.    |
| `customers`      | The public who signed up - they book and keep a shortlist.     |
| `business-users` | Partner logins for the venue dashboard.                        |
| `saved-listings` | A customer's shortlist rows.                                   |
| `closures`       | Venue closed-date ranges.                                      |
| `reviews`        | Review records (present; not yet surfaced on the site).        |
| `articles`       | Editorial, shared between web and print.                       |
| `issues`         | Print editions, with print run and page ranges.                |
| `media`          | Images and video, with rights tracking and unguessable names.  |
| `rate-limits`    | The shared auth rate-limit counter, in Postgres.               |
| `error-events`   | Server error log.                                              |
| `users`          | Vardenia staff and admin - the only accounts that reach admin. |

### Taxonomy is code, not data

Categories (`Hospitality -> Luxury Hotels`) and regions (`Mount Lebanon -> Keserwan`) live in
`packages/core` as TypeScript constants, **not** as CMS documents. They change roughly
never, they must be byte-identical across web, mobile, and print, and a duplicate category
typed by a tired editor is a whole class of bug we get to delete rather than fix.

Consequence: adding a category is a code change and a deploy. That is the right trade for
something that changes twice a year.

### Localization

Two layers, deliberately different widths.

The **interface** is offered in ten languages (`LOCALES` in `@vardenia/i18n`): English at
the root, the rest prefixed. English is the default; nothing is guessed from the browser, so
a reader picks a language with the switcher, which lists each language by its English name
(Arabic, Chinese) rather than its endonym. All ten have a full message catalogue
(`packages/i18n/src/messages/*.json`, kept at identical key sets); `getMessages` still falls
back to English if a locale is ever missing, so a page renders rather than throws.
`hreflang` is advertised only for the pair with translated content (`lib/seo`), because
telling Google a page is French when its listings are still English is worse than saying
nothing.

The **content** is stored in English and Arabic only (`TRANSLATED_LOCALES`), which is what
the editorial team writes. Payload's field-level localization stores both on the same
document with English fallback, so a half-translated listing degrades gracefully instead of
rendering blank. A UI locale the CMS does not store is queried in English via
`dataLocale(locale)`, applied at every Payload `find` with a locale - so the data side stays
matched to the `payload._locales` enum in the database. Widening it (adding a real content
language) is a migration made on purpose, plus a translation tab per field in the admin, not
a side effect of adding a switcher language.

Arabic is RTL, which is the reason direction is derived from exactly one function
(`dirFor()` in `@vardenia/i18n`) and never hardcoded; Urdu is the other RTL locale. Chinese,
Hindi, Bengali and Russian carry scripts the Latin and Arabic families do not draw, so each
has its own Noto face in `apps/web/src/app/fonts.ts`, wired per language with a `:lang()`
block in `globals.css` exactly as Arabic is. Those faces are `preload: false` and only
fetched by a reader whose page is in that language, so a French visitor never downloads the
Chinese one.

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

Four kinds of account across three auth collections, kept deliberately apart in
`apps/web/src/access/`. The separation is a property of the schema, not of a check: a
customer must never be able to authenticate against the collection that reaches the admin
panel.

- **staff** (`users`) - creates and edits all content: listings, articles, issues, media.
- **admin** (`users`) - all of that, plus identity (accounts), the permanence layer (QR
  codes, scan events) and commercial flags (`tier`, `verified`).
- **customers** - the public who signed up. They book and keep a shortlist, and see their
  own bookings and saves, nothing else.
- **partners** (`business-users`) - a venue signing in to a light dashboard to see the
  bookings for the businesses it manages, and its own printable code.

There were four staff roles at first. The extra two barely changed behaviour, and one
documented difference, "sales cannot publish articles", was never actually enforced. A role
that does not change what someone can do is worse than no role, because it reads as a
guarantee nobody is checking. Split them again when two real people genuinely need
different powers, and enforce the difference in the same commit that introduces it.

**Partners sign in, but they do not edit their listing.** The dashboard reports (their
bookings) and gives (their code); every change to the listing itself still goes through the
team. That is an editorial decision before a technical one: a curated title cannot let its
subjects edit their own entries, or the standard drifts to whatever each business wants to
say about itself. The cost is that listings only stay current if the team keeps them
current - a staffing commitment, priced into the editorial calendar, not solved later with
a self-serve portal nobody planned.

> This changed. An earlier version of this document said listed businesses have no accounts
> and there is no logged-in outsider, so access "only ever separates staff and the public,
> no per-record scoping". Customers, partners, and per-record scoping all exist now.

**Access is per-record, expressed as query constraints.** Every access rule returns a
where-clause rather than a boolean, so Payload filters in the database. A customer asking
`/api/bookings` gets their own rows and no way to page past them - not a full list they
were merely not shown, and not even a count of what exists. A partner gets only the
bookings for the businesses they own. See `collections/Bookings.ts`, where the access rules
are the substance of the file, and `SavedListings.ts` and `Customers.ts` for the same shape.

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

Web pages read Payload through the local API (no HTTP hop), which is the only half of this
picture that exists today.

The mobile arrow is a plan, not a description. `@vardenia/api-client` was written against a
public API that was never built: its paths and response shapes do not match what Payload's
REST API actually serves, and nothing imports it. The intent - validating every response
against a shared schema so a breaking change fails loudly in development rather than
silently in a build already shipped to the App Store - is still the right one. It is simply
not in force. Read the header of `packages/api-client/src/index.ts` before relying on any
of it.

## Geo

Postgres with PostGIS. "Attractions near me" is a spatial query against
`businesses.location`, not a town lookup table. Coordinates are validated against a Lebanon
bounding box on save, which catches the classic transposed lat/lng before it puts a Beirut
hotel in the Mediterranean.

## What is deliberately deferred

- **Payments / advertiser self-serve checkout.** Sales is consultative at this stage; a
  Stripe integration before there are ten advertisers is speculative work. Booking payments
  are their own deferral, with the provider and per-type questions in ADR 0007.
- **A separate analytics warehouse.** `scan-events` in Postgres is fine into the millions.
  See ADR 0004 for the trigger and the migration path.
- **Shared UI components between web and mobile.** We share tokens, not components. The
  cross-platform component abstraction costs more than it saves at this size.
- **Country editions (Cyprus, Greece, UAE...).** The data model is single-country on purpose.
  See ADR 0005 for what multi-country would cost and when to pay it.

## Related documents

- [`docs/ROADMAP.md`](ROADMAP.md) - build order
- [`docs/adr/`](adr/) - architecture decision records
