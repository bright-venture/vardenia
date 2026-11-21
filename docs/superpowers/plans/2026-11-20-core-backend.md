# Core Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Complete the backend for restaurants, hotels, guest houses and listing-only services: tiers with caps, public contact details, partner self-editing, public address and map link, hotel option lists and public prices, guest houses sold as a whole property, booking price snapshots, restaurant seating areas, restaurant brands and branches, and review rules.

**Architecture:** Pure rules go in `packages/core`. Payload collections and hooks in `apps/web/src`. Partners edit their own listings through Payload's normal update, restricted by an allow-list hook (the pattern of `guardRoomTypeWrite` and `guardClosureWrite`). Public JSON stays under existing route conventions, never `/api`.

**Spec:** `docs/superpowers/specs/2026-11-20-core-backend-design.md` (binding; its Rulings section settles ambiguities).

## Global Constraints

- Branch `core-booking`. Do not commit, push, merge or deploy unless the tech lead asks. Every task ends at green tests.
- Backend only. Do not restyle pages; make the smallest change that keeps a public page correct.
- Source files are ASCII (Arabic only in the i18n JSON). New user-facing strings go in all 10 `packages/i18n/src/messages/*.json` files (real Arabic in ar.json, English text in the others).
- Staff-only stays staff-only with field-level `access.read`: tier, commission, verified, contract dates, `submission.*`, `importBatch`, `qrCode`, internal notes.
- Public reads must never expose staff-only fields. Public JSON routes are rate limited (`withRateLimit`) and `no-store` unless cacheable by design.
- Money is USD, numbers with at most two decimals, never negative.
- A booking is a half-open interval `[start, end)`; capacity is enforced in the database path. Do not weaken `guardBookingWrite`, `booking-service` or `availability`.
- Never run migrations, seed or `pnpm dev`. Task 11 only generates the migration. `generate:types` may run against the dev DB in `.env` (never `.env.prod`).
- Tests: `pnpm --filter @vardenia/web test`, `pnpm --filter @vardenia/core test`, `pnpm --filter @vardenia/web typecheck`. Failing test first. Known unrelated failure: `ContentPage.test.tsx`.
- Existing listings are fake test data; never depend on them.

## Review Focus

1. A partner can change only allow-listed fields of listings they own, including via a crafted REST body. (Tasks 3, 9)
2. Public reads never leak staff-only fields. (Tasks 1, 2, 5, 6, 9)
3. Tier caps: lowering a cap below the number sold is refused. (Task 1)
4. Booking capacity is never weakened. (Tasks 6, 8)
5. The price snapshot equals the public quote. (Task 7)

### Task 1: Tiers - platinum, home page, category top, admin caps

**Goal:** Four tiers: bronze (website), silver (+ magazine), gold (+ top of its category), platinum (+ home page). Two admin inputs: maximum gold per category and maximum platinum, both default 6.

**Start from:** `packages/core/src/tiers.ts` (ladder, `HOME_PAGE_PLACES`, capabilities), `apps/web/src/fields/tier.ts`, `apps/web/src/globals/Settings.ts` (Tiers section), `apps/web/src/lib/gold-places.ts`, `apps/web/src/lib/listings.ts` (home band and `-tier` sorts), `ensureQrCode`, `protectPrintedCodes`, `home-listings.ts`, `listing-gaps.ts`, tests mentioning tiers, i18n tier labels.

**Requirements:**

- Add `platinum` as the top rung of `LISTING_TIERS`. Enum order is the sort order: bronze, silver, gold, platinum, so `-tier` puts platinum first. A new rung is declared in its place on the ladder.
- Capabilities (declare once in `tiers.ts`, UI reads them): bronze website only; silver website + magazine (printed QR code as today); gold adds `topOfCategory`; platinum adds `homePage` and keeps `topOfCategory`.
- The home page band shows platinum listings, not gold. Replace the single "home page places" setting by two settings: `maxGoldPerCategory` (default 6) and `maxPlatinum` (default 6), in the Settings global's Tiers section, with a clear admin description. Keep reading the old setting only if a migration-free fallback is needed; do not keep both active.
- Enforce on save (extend the existing cap logic in `Settings`/`gold-places`): refuse making a listing platinum when `maxPlatinum` are already platinum; refuse making it gold when its category already holds `maxGoldPerCategory` gold listings (count non-trashed listings of the same `category`, any status, excluding the listing itself). Platinum does not count against the gold per-category cap. Readable error naming the limit.
- Refuse lowering either setting below the number currently sold (as the admin already does for the old setting).
- Every directory/category/search sort keeps ranking platinum, then gold, then silver, then bronze; the home page band draws from platinum only.
- Existing gold listings stay gold.
- `payload-types` regenerate; tests updated and new tests for: ladder order, capabilities, cap enforcement per category and global, refusal when lowering, home band picks platinum only, sort order.

**Interfaces other tasks rely on:** `LISTING_TIERS` includes `platinum`; `can(tier, 'topOfCategory' | 'homePage')`.

### Task 2: Public contact details, no website

**Goal:** Listings have optional public contact details the business manages: phone, WhatsApp, email, and social links. No website field anywhere.

**Start from:** `apps/web/src/collections/Businesses.ts` (the `submission` group has `publicPhone` and `website`), `packages/core/src/place-submission.ts` (+test), `apps/web/src/lib/place-submission.ts`, `components/places/PlaceSubmissionForm.tsx`, `form-model.ts`, `submit-client.ts`, `lib/place-submission-email.ts`, preview templates, i18n `magazinePlaces` keys, `guardSort`.

**Requirements:**

- New group `contact` on `businesses`, publicly readable: `phone`, `whatsapp`, `email`, `instagram`, `facebook`, `tiktok`, `snapchat`, `youtube`, `x`, `linkedin`. All optional. Validation: phone/whatsapp loose international format (digits, spaces, `+`, `-`, parentheses, 6-20 chars); email a valid address; social links must be `https://` URLs on the right host (instagram.com, facebook.com or fb.com, tiktok.com, snapchat.com, youtube.com or youtu.be, x.com or twitter.com, linkedin.com) or a bare handle that the hook turns into the full URL for instagram, tiktok, x, snapchat. Reject any other scheme (`javascript:`, `data:`).
- Remove `website` from the `submission` group, from the submission schema, the form, the route mapping, the emails and the i18n keys. Move `publicPhone` into `contact.phone` (drop it from `submission`). The form keeps one public phone input and gains optional Instagram and Facebook inputs (simple text fields); the route maps them into `contact`.
- Business owners can later edit `contact` (Task 3 adds it to the allow-list; here just make the field public-readable and well validated).
- `guardSort` covers any newly added staff-only paths; contact is public so it is not guarded.
- Tests: schema accepts/rejects, handles normalised to URLs, hostile URLs refused, the created draft stores contact, website no longer accepted (unknown keys stripped), public read returns contact.

### Task 3: Partner can edit their own listing

**Goal:** A signed-in partner edits their own listings from the dashboard, only on an allow-list of fields. Partners also upload images and a menu file for their own listings.

**Start from:** `access/index.ts` (`ownedBusinessIds`, `publishedStaffOrOwned`, `isStaffOrOwnerFieldLevel`), `hooks/guardRoomTypeWrite.ts`, `hooks/guardClosureWrite.ts`, `hooks/guardSelfAccountUpdate.ts`, `collections/Media.ts`, `hooks/limitUploadSize.ts`, `hooks/blockMediaInUse.ts`, `hooks/autoTranslateListing.ts`.

**Requirements:**

- `businesses.update` allows staff (as today) and a business-user for the ids in `ownedBusinessIds`, as a query constraint (never a boolean).
- A `beforeValidate`/`beforeOperation` hook `guardPartnerListingWrite` applies only to business-users: any key outside the allow-list is refused with a readable public APIError (400). The allow-list is one exported constant `PARTNER_EDITABLE_FIELDS` in `packages/core` so later tasks append to it. Initial allow-list: `name`, `tagline`, `description`, `heroImage`, `gallery`, `logo`, `menu`, `amenities`, `payments`, `openingHours`, `seasonality`, `address`, `contact`, `tags`. Later tasks add their fields. Never allowed: `_status`, `tier`, `verified`, `slug`, `qrCode`, contract and commission fields, `booking` rules, `issue`, `listingNumber`, `submission`, `importBatch`, `category`, `subcategories`, `governorate`, `district`, `brand`.
- A partner cannot change `_status` (cannot unpublish or publish) or delete a listing (`delete` stays staff-only).
- Media: a business-user may create `media` for the purposes of their listing only: image types and PDF, existing size limits and unguessable filenames, rate limited; the media row records which partner uploaded it. A partner may attach to their listing only media they uploaded (a guard refuses another's media id). Partners cannot read other partners' unattached media. Staff behaviour unchanged. Check how media access and `blockMediaInUse` interact and keep them intact.
- Translation: confirm what `autoTranslateListing` does on a partner edit; it must not run unbounded or cost per keystroke; if it can, apply the same debounce/skip rule the admin uses and state the result in the report.
- Tests: partner edits an allow-listed field on own listing (ok); sends a forbidden key (refused); edits another partner's listing (refused/not found); cannot change status; cannot attach another partner's media; staff unchanged; crafted REST body with nested forbidden keys refused.

### Task 4: Address and map link public and editable

**Goal:** The address and a map link are shown publicly. The business enters them in the dashboard.

**Start from:** `lib/location-display.ts` (the `SHOW_LOCATION` switch), `lib/maps-link.ts`, `components/admin/MapsLinkField`, `Businesses.ts` (`address`, `location`, `area`), the listing page's use of `SHOW_LOCATION`.

**Requirements:**

- Turn the location display on (area, address, map links) and keep the code path tidy; remove the hidden-for-now workaround only as far as needed.
- Add public `mapUrl` text field (the pasted Google Maps link). Validate it as an `https://` URL on `google.com/maps`, `maps.google.com`, `goo.gl/maps` or `maps.app.goo.gl`. A hook fills the `location` point from the link when the link carries coordinates (`@lat,lng` or `!3dLAT!4dLNG` or `?q=lat,lng`); short links are stored as is and do not change `location`. Never fetch the network.
- `address` and `location` are public. Add `mapUrl` and `location` to `PARTNER_EDITABLE_FIELDS` (Task 3's constant). Partners can also set `location` directly as a point with latitude and longitude validation.
- Tests: link parsing for each format, hostile or unknown links refused, short link kept without a point, partner can set address, link and point.

### Task 5: Hotels - option lists, facilities, public prices

**Goal:** Each room type has Booking.com-style option lists the hotel chooses from; the hotel has facilities and highlights; prices are public.

**Start from:** `collections/RoomTypes.ts` (amenities, views, options with price), `lib/room-display.ts`, `components/rooms/RoomsSection.tsx`, `packages/core/src/attributes.ts`, `canHaveRoomTypes`, `hooks/guardRoomTypeWrite.ts`.

**Requirements:**

- Option lists live in `packages/core` as code with English and Arabic labels, like `AMENITIES`. Keep every slug that exists today.
  - Room options (merge into the existing room amenities/views; do not duplicate): private-kitchenette, private-bathroom, shared-bathroom, bathtub, shower, balcony, terrace, sea-view, mountain-view, city-view, garden-view, pool-view, landmark-view, air-conditioning, heating, flat-screen-tv, free-wifi, minibar, coffee-machine, kettle, refrigerator, microwave, safe, desk, seating-area, dining-area, sofa, wardrobe, hairdryer, free-toiletries, bathrobes, slippers, iron, soundproofing, fireplace, extra-bed-available, crib-available. Size in m2 stays its own number field.
  - Hotel facilities (full list), `popularFacilities` (subset of the full list, max 8) and `propertyHighlights` (max 6) as three public `select hasMany` fields on `businesses`, valid only when `canHaveRoomTypes`: facilities include free-wifi, parking-free, parking-paid, airport-shuttle, family-rooms, non-smoking-rooms, restaurant, bar, 24h-front-desk, room-service, fitness-centre, spa-wellness, outdoor-pool, indoor-pool, pets-allowed, accessible, breakfast, terrace, garden, beachfront, ev-charging, laundry, business-centre, meeting-rooms, kids-club, babysitting, currency-exchange, luggage-storage, concierge, bbq, elevator, heating, air-conditioning-public. Highlights: parking, wellness, breakfast, pool, beachfront, mountain-view, city-centre, family-friendly, romantic, business-friendly, pet-friendly, quiet-location.
  - Note in the code comment and the report that Booking.com's page could not be read, so these lists follow its standard facility names and need the lead's confirmation.
- Prices: the room option `price` (USD per night) becomes publicly readable (it is staff and owner only today). Add a pure helper in core, `fromPrice(options)`, returning the lowest active price. Validation: price optional but if set must be a number >= 0 with at most 2 decimals.
- The hotel and its room types are editable by the owner: add `facilities`, `popularFacilities`, `propertyHighlights` to `PARTNER_EDITABLE_FIELDS`; confirm `room-types` write access already lets the owner choose the new options and set prices; if not, fix it.
- A restaurant or any non-hotel cannot save these facility fields (validation message).
- Tests: lists have unique slugs and Arabic labels; old slugs preserved; public read of room-types returns price; popular must be subset and max 8; owner can write; other kinds refused.

### Task 6: Guest houses sold as a whole property

**Goal:** A guest house is booked as a whole property for nights, with a nightly price, an included-guest count, an extra-guest fee, optional packages and optional features, all managed by the owner.

**Start from:** `packages/core/src/taxonomy.ts` (`ROOM_TYPE_SUBCATEGORIES`, `canHaveRoomTypes`), `fields/bookingRules.ts`, `collections/RoomTypes.ts` filterOptions, `lib/booking-service.ts`, `lib/availability.ts`, `app/booking/availability`, `app/booking/request`, `packages/core/src/booking-request.ts`.

**Requirements:**

- `getaways` stops being a room-type kind: `ROOM_TYPE_SUBCATEGORIES` becomes hotels only. Adjust `RoomTypes` filterOptions and checks; existing data is fake so no data migration is needed.
- New public group `stay` on `businesses`, only valid when the listing has the `getaways` subcategory (validation message otherwise): `nightlyPrice` (USD), `includedGuests` (integer >= 1), `maxGuests` (integer >= includedGuests, the hard cap, optional), `extraGuestFee` (USD per extra guest per night, default 0), `childrenCountAsGuests` (boolean, default true), `minNights` (default 1), and `packages`: array of up to 10 rows `{ label (localized), description (localized), price (USD), unit: 'per-night' | 'per-stay' | 'per-person-per-night', active }` with stable row ids.
- New public group `features` (getaways only): checkboxes `musicAllowed`, `eventsHosted`, `partiesAllowed`, `gardenAccess`, `barbecue`, `pool`, all optional.
- Pure quote function in `packages/core` (`quoteStay`): inputs nights, adults, children, the `stay` config and an optional package id; output total, currency, per-line breakdown (nightly or package, extra guests), or a refusal reason (`below-min-nights`, `above-max-guests`, `unknown-package`, `inactive-package`). Rules: guests counted = adults (+ children when `childrenCountAsGuests`); extra = max(0, guests - includedGuests); a package replaces the nightly price for its unit; extra-guest fee applies per extra guest per night on top. Fully unit-tested, including rounding to two decimals.
- Booking rules for a guest house: whole property means capacity 1 (one stay at a time); document in the field description and make the booking service reject a stay shorter than `minNights` and more guests than `maxGuests`. Do not weaken the overlap check.
- `stay` and `features` go on `PARTNER_EDITABLE_FIELDS`. Restaurants and hotels cannot save them.
- Tests: quote table-driven; validation of getaways-only; partner can edit; a second overlapping stay is refused; room types can no longer be created for a getaway.

### Task 7: Price snapshot on bookings, hotels and guest houses

**Goal:** A booking stores the price the customer was quoted, and the availability endpoint returns the quote before booking.

**Start from:** `collections/Bookings.ts`, `lib/booking-service.ts`, `lib/room-booking.ts`, `lib/room-availability.ts`, `app/booking/availability`, `app/booking/rooms`, `app/booking/request`, `packages/core/src/booking-request.ts`, `quoteStay` (Task 6), `fromPrice` (Task 5).

**Requirements:**

- New group `price` on `bookings` (readable by staff, the owning business and the booking's customer; written only by the booking service): `total`, `currency` ('USD'), `lines` array `{ label, amount }`, `nights`, `quotedAt`. Empty for restaurants and for businesses without prices.
- Hotel: total = sum over room lines of nights x option price x count, using the room option price at booking time; refuse the request when a chosen option has no price only if the hotel's rooms are priced elsewhere (decide and note: unpriced options simply produce no snapshot, never a zero total).
- Guest house: the `quoteStay` result; the request may carry an optional `packageId`.
- `/booking/availability` and `/booking/rooms` include the quote (or the refusal reason) in the response; `/booking/request` recomputes the quote on the server and stores it; a quote sent by the client is never trusted.
- Editing a business price later never changes existing bookings.
- Restaurants never get a price group.
- Tests: hotel totals (multi-room, multi-night), guest house with and without package and extra guests, snapshot unchanged after price edit, forged client price ignored, customer reads own snapshot only.

### Task 8: Restaurant seating areas

**Goal:** A restaurant defines seating areas (smoking or non-smoking, indoor or outdoor), each with its own capacity. The customer picks an area; capacity is checked per area.

**Start from:** `lib/availability.ts` (capacity counts overlapping bookings; "a single number"), `fields/bookingRules.ts`, `collections/Bookings.ts`, `lib/booking-service.ts`, `app/booking/request`, `packages/core/src/booking-request.ts`, `guardBookingWrite`, the DB-level capacity path in `booking-service`.

**Requirements:**

- New public group on `businesses` valid only for restaurants: `seatingAreas`, an array of up to 8 rows `{ setting: 'indoor' | 'outdoor', smoking: boolean, tables: integer >= 1 (how many bookings may overlap in this area), label (optional, localized) }`. The area key is `indoor`, `indoor-smoking`, `outdoor`, `outdoor-smoking` ( unique per listing; duplicates refused ). Add to `PARTNER_EDITABLE_FIELDS`.
- `bookings` gets an optional `area` field (the key). The booking request accepts `area`. When the listing defines areas, `area` is required and must be one of them; capacity for that booking is the area's `tables`, counted only against bookings with the same area. A listing without areas behaves exactly as today. Bookings without an area on a listing that later gains areas are ignored by per-area counts (note this).
- Optional stay length: confirm how the customer chooses duration today (booking rules min/max duration); if the request cannot carry a duration, accept an optional `durationMinutes` within the rules' min and max and default to the rules' min; otherwise leave as is and say so in the report.
- Smoking and outdoor-seating amenities stay as they are.
- `/booking/availability` returns availability per area for a restaurant that has areas.
- Tests: two areas with different capacity fill independently; area required when defined; unknown area refused; legacy listing unchanged; overlap race still refused; owner can edit areas; non-restaurant cannot save them.

### Task 9: Restaurant brands and branches

**Goal:** A restaurant brand groups branches. Each branch is a listing with its own location, hours and reservations. A partner manages all their branches and can add a branch. The customer opens the brand, picks a branch, and books on it.

**Start from:** `collections/BusinessUsers.ts` (`businesses` is staff-only), `lib/session.ts` (`ownerListings`), `hooks/linkPartnerOnPublish.ts`, `lib/place-submission.ts` (draft creation pattern, slug clash retry), `app/place-submissions/route.ts` (public door pattern), `lib/known-paths.ts` and `proxy.ts` (path registration), `fields/bookingRules.ts`, `lib/rate-limit.ts`, `lib/place-submission-email.ts`.

**Requirements:**

- New collection `brands` (`brands`): `name` (localized), `slug` (unique, permanent once set, generated like listing slugs), `logo`, `description` (localized), `published` (read-only mirror: a brand is public when at least one of its listings is published). Public read of a brand is allowed only when it has a published branch; staff manage all. Brand create/update is staff or the system; a partner cannot edit it directly (the branch endpoint creates it).
- `businesses.brand` relationship (optional, restaurants only; validation message otherwise). Staff can set it; partners cannot (not on the allow-list).
- Public lib and route `GET /brands/[slug]` (register the path): brand name, logo, description, and its published branches (id, name, slug, address, governorate, district, map link, location, opening hours, whether booking is enabled), nothing staff-only. Rate limited.
- Partner branch endpoint `POST /partner-data/branches`: a signed-in partner who owns a restaurant listing (the source) sends the new branch's name suffix or name, governorate, district, address, map link or point, opening hours and contact. The server creates the brand if the source has none (named after the source, source linked) and creates a new draft listing copied from the source (category, subcategories, tagline, description, hero, gallery, logo, amenities, payments, menu, contact, seatingAreas), with `booking.enabled` false, tier default, no contract, `submission.status` pending with the partner's email, linked to the same brand and appended to the partner's `businesses` through the system (overrideAccess). Limits: at most 20 branches per brand, 5 new branches per partner per day, rate limited, slug clash retry as in the submission route, no QR code minted on draft, team notified by email. Staff publish after setting tier and contract (the existing publish hook links the partner idempotently).
- Partners see all their listings already through `ownerListings`; add a lib helper that groups them by brand for the dashboard.
- Booking stays per listing; nothing in the booking path changes.
- Tests: public brand read hides drafts and staff-only fields; a partner cannot create a branch from a listing they do not own or a non-restaurant; limits; copied fields are an allow-list; brand auto-created once; staff publish links without duplicates.

### Task 10: Review rules

**Goal:** Only bookable services can be reviewed, and only by a customer whose booking the business marked completed.

**Start from:** `collections/Reviews.ts`, `app/reviews/route.ts`, `lib/review-service.ts`, `lib/reviews.ts`, `packages/core/src/booking.ts` (`BOOKING_TRANSITIONS`, `ACTOR_TARGETS`), `hooks/guardBookingWrite.ts`, `hooks/notifyBookingStatus.ts`.

**Requirements:**

- Verify and cover with tests the whole chain: customer books; the business (owner) marks the booking `completed` (only after its start time, only on their own listing); only then the review route accepts a review from that same customer for that listing, once per booking; a customer cannot complete their own booking; a no-show or cancelled booking cannot be reviewed.
- Refuse reviews for a listing that does not take bookings (`booking.enabled` false or non-bookable subcategory) with a clear reason code even if a booking row somehow exists.
- If the invitation to review is already sent when the booking becomes completed, keep it; if not, add the smallest hook so the customer is told they can now review (reuse `notifyBookingStatus` patterns and the email palette; strings in all 10 locales).
- Fix any gap found; report precisely what was already correct.
- Tests per rule above.

### Task 11: Migration, types, docs

**Goal:** One migration for all schema changes, regenerated types, docs updated.

**Requirements:**

- Generate one Drizzle migration with additions only for new tables, columns and the `platinum` enum value (`ALTER TYPE ... ADD VALUE` placed correctly; enum order as declared in Task 1), plus drops only for the columns removed from the `submission` group in Task 2 (`submission_website`, `submission_public_phone`) with a `down` that is safe (IF EXISTS). Review the SQL by hand for: no default that would change existing rows (the lesson from `submission_status`), RLS enabled on new tables like `listing_ranges`, indexes, unique slug on brands.
- Do not apply the migration anywhere. Regenerate `payload-types.ts` and the admin import map if components were added.
- Update `docs/ARCHITECTURE.md`: collections table (`brands`), partner editing section, tiers section (four tiers and two caps), public routes (`/brands/[slug]`, `/partner/branches`), the booking price snapshot, restaurant areas and guest house whole-property model.
- Add `.env.example` entries only if new env vars were introduced.
- Run the full web and core test suites and typecheck; report any failure that is not caused by this work (known: `ContentPage.test.tsx` fails on an unmocked `next/font/google` in a frontend component).

### Task 12: Small frontend for the new features only (new components, main design untouched)

**Goal:** Everything built in Tasks 1-10 is backend. The tech lead's rule: the main design is NOT touched; only where something NEW has no UI at all, add a small, plain design for it, built from the existing components, tokens and form styles, mounted in the least invasive way.

**Hard rules:**

- Do not restyle, restructure or rewrite any existing page, component or CSS. Existing files may only gain a small mount point (an import and one element or one conditional block) where a new component must appear. Prefer NEW files. No changes to `packages/tokens`, global CSS files, or the homepage/design files the frontend developer owns (`*-desktop-pages.css`, `redesign.css`, `inner-pages.css`, `home*.css`, pinned-photos, recovery, remaining-desktop).
- Use the existing design language: tokens, `LINK` / form styles in `components/formStyles`, the partner dashboard layout (`partner/(dashboard)`), existing `data-ui` conventions; logical CSS only (RTL first-class); all strings in all 10 i18n JSON files (real Arabic in ar.json); plain and small, no new visual style.
- Backend is already done and tested; call it through Payload REST/the existing endpoints. Do not change backend behaviour. If a backend gap blocks a component, report it instead of changing the backend.

**Build (each a new component plus a minimal mount):**

1. Partner dashboard, edit listing details (one new page or section under `partner/(dashboard)/listing`): contact (phone, WhatsApp, email, social links), address and map link, and the amenities/payments fields on the partner allow-list; hotels: facilities, popular facilities, highlights; guest houses: stay pricing (nightly price, included guests, max guests, extra guest fee, minimum nights), packages (add/edit/remove rows) and features; restaurants: seating areas (add/edit/remove rows). Only fields the partner allow-list accepts, sent as ids/plain values as the guard requires (see PARTNER_EDITABLE_FIELDS and lib/field-shape). Show backend error messages.
2. Partner dashboard, branches (restaurants): list the partner's branches grouped by brand and a form to add a branch via `POST /partner-data/branches` (Task 9).
3. Public listing page additions (new small components mounted where the existing page already has an obvious slot): contact links, hotel facilities/highlights, guest house features and stay pricing summary, restaurant seating areas; room option prices on the rooms section (the data is public now).
4. Booking panel additions: restaurant area selector (when the listing has areas); guest house package selector and the quote total; hotel total from the quote endpoints. These are small additions to the existing booking panel, not a redesign.
5. Brand page: a public page for `/brands/[slug]` (reads `GET /brand-data/<slug>`) listing the branches with a link to each branch listing; plain list.

**Review focus:** the diff to existing files is tiny and mount-only; no style regressions; RTL; every string in 10 locales; nothing sends a field outside the allow-list; works with the real endpoints.
