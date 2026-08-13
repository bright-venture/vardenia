# Build order

Sequenced so that something demonstrable to an advertiser exists as early as possible.
Nothing here is a deadline; it is a dependency order.

## Phase 0 - Foundation [done] (this scaffold)

Monorepo, Payload schema, access control, QR redirect, i18n, tokens, CI.

## Phase 1 - A directory that works

The minimum that makes Vardenia real. Until this exists there is nothing to sell.

- [x] Directory list + category filter (region, price, amenities filters still to come)
- [x] Listing detail page - gallery, hours, map link, call / directions / reserve actions
- [ ] Map view with clustering
- [ ] "Near me" via PostGIS radius query
- [ ] Search (Postgres full-text first; reach for a search service only if it proves inadequate)
- [x] `/scan/not-found` and `/scan/moved` pages
- [ ] Seed 150-300 real listings

> The last two matter more than they look. A printed magazine referencing a directory of
> 30 listings undersells the product, and a scan that dead-ends undoes the brand promise
> the magazine just made.

## Phase 2 - The commercial layer

What turns the directory into revenue.

- [ ] Staff scan report view: per listing, by placement, over time, by city
- [ ] Exportable renewal report (PDF) the team sends to each advertiser
- [ ] QR code generator: printable SVG/PDF sheets per issue, per placement
- [ ] Tier-gated rendering driven by `TIER_CAPABILITIES`
- [ ] Media kit page with live directory stats

## Phase 3 - Editorial and print

- [ ] Article and issue templates
- [ ] Digital edition (flipbook) reader
- [ ] "As seen in issue N, page 42" cross-links between listings and stories
- [ ] Arabic editorial pass - RTL layout QA on every template

## Phase 4 - Mobile

- [ ] Directory browse + map, sharing the API
- [ ] Native QR scanner with deep-link resolution (`resolveQr`, no browser bounce)
- [ ] Offline caching of listings for saved regions - tourists roam without data
- [ ] Push notifications, geofenced to nearby partner venues
- [ ] Saved places / itinerary builder

## Phase 5 - Growth

- [ ] SEO: structured data (`LocalBusiness`, `TouristAttraction`), sitemaps, hreflang
- [ ] Partner API for tourism authorities and hotel groups
- [ ] Affiliate booking integrations
- [ ] Newsletter

## Explicitly not doing yet

Payments and self-serve advertiser checkout; a second country edition; a separate analytics
warehouse; shared cross-platform UI components. Reasons are recorded in the ADRs.
