# Business submission form (magazine places page)

Status: proposed, waiting for approval. Written 19 November 2026.
Branch: `feature/business-onboarding-form` (from `staging`).

## Intent

A business owner scans a QR code, lands on `/magazine-places`, fills in everything we need to
list their business, and sees it laid out as a page of the printed book while they type. On
submit, the business is saved as a **draft listing** (hidden from the website). The team reviews
it; on approval a **partner account** is created and linked to that listing.

Why: onboarding is done by staff today, one business at a time. The form lets owners do the data
entry while the team keeps control of what goes public. We have about 20 days to launch.

## Goals

- Owner picks one of three page templates (A hero, B editorial, C cover) and sees a live
  preview shaped like a page of the issue book (A4 portrait).
- Submit creates a draft listing, never a published one.
- Approving a submission creates (or reuses) the partner and links the listing.
- Nothing staff-only (tier, commission, contract, verified, QR code, slug) can be set from the
  public form.

## Non-goals

- The preview is not the real book page. No sample page is in the repo, so v1 uses an A4
  portrait box and the brand tokens; the ratio is one CSS variable so it can be corrected.
- No owner self-service editing after approval (partners stay read-only on their listing,
  per the architecture notes).
- No payments, no automatic publishing, no automatic partner sign-up.
- No new public contact fields on the website listing page. Phone, email and website from the
  form are stored for the team only.

## Anti-goals

- A stranger gets a login or a public listing without a person checking it.
- Opening `businesses.create` or `media.create` to the public. Both stay staff-only; one server
  route is the only door and it ignores every field not on its allow-list.

## Approaches considered

1. **Draft listing directly (chosen).** The form creates a `businesses` row with
   `_status: draft`. Approval is editing and publishing the same record. Needs guard rails on
   the one public route and a few new staff-only fields.
2. **Separate application record, converted later.** Safer against public writes but adds a
   conversion step and a second copy of every field. Too slow for 20 days.
3. **Reuse `place-requests` only.** It has no listing fields, so the form would still need a
   place to put them, and a draft listing already carries the same status. Dropped: the form
   does not touch `place-requests`, which stays as it is for the team's own use.

## Design

### Data

New group `submission` on `businesses`, every sub-field staff-only (field-level `access.read`,
no public create/update; written only by the route with `overrideAccess`):

| Field                                   | Notes                                                                                                                                               |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `status`                                | `pending` (awaiting review) / `approved` (set automatically when published) / `rejected` (set by staff); empty on listings staff created themselves |
| `ownerName`, `ownerEmail`, `ownerPhone` | who submitted                                                                                                                                       |
| `publicPhone`, `website`                | stored, not shown on the site yet                                                                                                                   |
| `pageTemplate`                          | `a` / `b` / `c`                                                                                                                                     |
| `submittedAt`                           | timestamp                                                                                                                                           |

The existing listing fields carry the rest (name, tagline, description, hero image, gallery,
logo, category, subcategories, governorate, district, address, opening hours, price range,
amenities, payments). Draft is the existing `_status`; `submission.status` is what tells
"awaiting review" apart from "hidden after a contract ended".

A migration adds the columns (Payload dev auto-push covers local development only).

### The one public door

`POST /magazine-places/submit` (multipart: JSON fields plus up to 1 hero, 6 gallery, 1 logo).
Order: rate limit (shared, Postgres) -> Turnstile -> parse with one zod schema in
`packages/core` (also used by the form) -> create media (type and size limited, existing
`limitUploadSize`) -> create the draft listing with forced `_status: draft`, default tier,
no commercial fields, no `qrCode` -> email the team and the owner.
Any failure after media is created leaves no listing; orphan uploads are acceptable in v1 and
reported.

The path is added to `known-paths` so the middleware serves it.

### Approval (no new admin screen)

Publishing is accepting; rejecting is a marker. A submitted listing stays Draft until staff
publish it (after setting tier and contract in the Commercial tab). A `businesses` hook runs
when a listing with a submission moves to Published: it sets `submission.status` to Approved,
finds the partner by `ownerEmail`, and if none exists creates one (name, email, phone, random
password the owner never sees), which fires the existing invitation email so the owner sets
their own password; if the partner exists, it appends this listing to their `businesses`.
Idempotent: if the partner already holds the listing (for example a renewal after a contract
lapse), nothing happens. To reject, staff set `submission.status` to Rejected; the draft stays
as a record and its listing number is released.

### The page

`/magazine-places`: preview at the top, form below, both in one client component. Template
radio (A/B/C) changes the preview only. Preview updates live from form state and local image
object URLs; nothing is saved until Submit. Strings in `packages/i18n` (English and Arabic
written; other locales fall back). RTL checked at `/ar`. Simple styling from tokens.

### Listing numbers: one issue, a block of numbers per governorate

For now there is one issue, **All Lebanon**, with a **total of 408** listing numbers. Inside it,
each of the seven governorates (Keserwan, North Lebanon, Beirut, Beqaa, South Lebanon, Chouf,
Matn) owns a **range** of those numbers, and together the ranges make up the 408. Both the total
and each governorate's range can be changed by staff. Nothing about the issue or the ranges is
hard-coded.

**Data (new, staff-managed in the admin):**

- `issues.listingTotal`: the total for that issue (408 for All Lebanon). Default 408.
- New collection **Listing number ranges** (`listing-ranges`), one row per issue and governorate:
  `issue`, `governorate` (the seven existing values), `from`, `to`. One row per governorate per
  issue (unique together).
- Rules checked on every save, with readable errors:
  - `1 <= from <= to <= listingTotal` of the issue;
  - no overlap with another governorate's range in the same issue, naming the one that clashes;
  - a range may not shrink or move so that a number already held by a listing falls outside
    it, and `listingTotal` may not drop below the highest number in use.
- Staff enter `from` and `to` for each row. On a new row, `from` is pre-filled with the next free
  number (the highest `to` already used in that issue, plus one: after Keserwan 1 to 90 the next
  governorate starts at 91). Numbers never move once set, so a number held by a business stays
  in its governorate. Gaps are allowed and show as unallocated.
- The admin shows a counter on the issue and on the list: "401 of 408 allocated". It is a
  status, not a block: the ranges are edited one row at a time, so the sum cannot be enforced
  on each save. Numbers that no range covers are simply not offered on the form.

**On the listing (new fields):**

- `issue` (relationship) and `listingNumber` (integer, nullable: older listings have none).
- A **unique index on (issue, listingNumber)**, so the database is the final judge: two owners
  picking the same number at once cannot both succeed; the loser sees "that number was just
  taken, pick another".
- Validation: the number must lie inside the range of the listing's governorate in that issue.

**Reserved on submit.** A draft submission holds its number at once, so nobody else can pick it
while the team reviews. Rejecting it, or moving the listing to the trash, releases it (a hook
clears the number).

**The form, step by step:**

1. The owner picks a **governorate** (and district, area and street address, which are plain
   listing fields and do not affect numbers).
2. The form asks `GET /magazine-places/numbers?governorate=<slug>`. The reply lists the issues
   that have a range for that governorate (today: All Lebanon), each with its range and the
   **taken numbers only** (never who holds them). Public, `no-store`, rate limited.
3. The owner sees every number in the range: free ones can be picked, taken ones are shown
   greyed out as inactive. If there is no range for the governorate, or every number is taken,
   the form says so and does not allow submit.
4. The chosen number shows in the preview as the page number (for example `VARDENIA - 47`).
5. On submit the route checks again: the number is in the governorate's range for that issue,
   and still free. Then the draft is created with that number.

**Staff** may set or change issue and number in the admin (Listing tab) with the same checks
and an error naming the listing that holds a number.

**`place-requests.placeNumber` is separate** and untouched.

## Left to the builder / my calls (correct any)

- Names of fields and the route path.
- Allow-list of amenities, categories and regions comes from `packages/core`.
- Image limits: 25 MB each (existing), JPEG/PNG/WebP only.
- Email wording for the team and owner notifications.
- District and area are asked on the form but only the governorate decides the numbers.

## Open questions

1. Do the pages match the real issue book? Needs one sample page (screenshot or the PDF page size)
   from the team to adjust the ratio and slots.
