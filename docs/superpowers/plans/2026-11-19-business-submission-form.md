# Business Submission Form Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An owner opens `/magazine-places`, picks a template, fills in their business, chooses a free listing number in their governorate, previews the page, and submits; the business is saved as a hidden draft, and publishing it later creates the partner.

**Architecture:** Pure rules (ranges, schema) live in `packages/core`. Payload gets one new collection (`listing-ranges`), three new fields on `issues`/`businesses`, and two hooks. One public route pair under `/place-submissions` is the only door that can create a draft listing; `businesses.create` and `media.create` stay staff-only. The page is one client form that renders a live A4 preview.

**Tech Stack:** Next.js 15, Payload 3 (Postgres, Drizzle migrations), zod via `@vardenia/core`, next-intl, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-19-business-submission-form-design.md`

## Global Constraints

- Branch `feature/business-onboarding-form`, created from `staging`. Do not commit, push or deploy unless the tech lead asks; every "Checkpoint" step below ends at green tests, not at a commit.
- Source files are ASCII (Arabic strings go in the i18n JSON, which is exempt). Arabic is first-class: use `dirFor()`, logical CSS properties, check `/ar`.
- Anything staff-only stays staff-only with field-level `access.read`: tier, commission, verified, contract dates, `submission.*`, `importBatch`, `qrCode`.
- Brand values come only from `packages/tokens`. Taxonomy and region lists come from `packages/core`.
- Total listing numbers: 408 (`DEFAULT_LISTING_TOTAL`), changeable per issue. Governorates in order: keserwan, north-lebanon, beirut, beqaa, south-lebanon, chouf, matn.
- Numbers never move once a range is set. A range may not exclude a number a listing holds.
- Run the web tests with `pnpm --filter @vardenia/web test` and core tests with `pnpm --filter @vardenia/core test`; types with `pnpm --filter @vardenia/web typecheck`.

## Review Focus

1. Two owners submit the same number at once: one wins, the other gets a "taken" answer and no half-made draft remains. (Task 5)
2. A crafted request posts a number from another governorate's range, a number past the total, or a taken number: refused by the server, not only by the picker. (Tasks 1, 5)
3. A crafted multipart body carries `_status: published`, `tier`, `verified`, `qrCode`, `importBatch` or `submission.status`: all ignored or forced. (Task 5)
4. A listing is published twice (a renewal after its contract lapsed), or the owner's email already belongs to a partner with other listings: no second partner, no second invitation, existing listings kept. (Task 4)
5. The governorate has no range or every number is taken: the form refuses to submit and says why; the picker works in Arabic/RTL. (Tasks 5, 8)

---

### Task 1: Listing number rules (pure, in core)

**Files:**

- Create: `packages/core/src/listing-numbers.ts`
- Modify: `packages/core/src/index.ts` (add `export * from './listing-numbers'`)
- Test: `packages/core/src/listing-numbers.test.ts`

**Interfaces:**

- Produces:
  - `LISTING_NUMBER_MIN = 1`, `DEFAULT_LISTING_TOTAL = 408`
  - `LISTING_GOVERNORATES: readonly ['keserwan','north-lebanon','beirut','beqaa','south-lebanon','chouf','matn']`
  - `interface NumberRange { governorate: string; from: number; to: number }`
  - `rangeProblem(candidate: NumberRange, others: readonly NumberRange[], total: number): string | null` (null means valid; the string names the clash)
  - `nextFreeNumber(ranges: readonly NumberRange[]): number` (highest `to` plus one; 1 when empty)
  - `numbersIn(range: NumberRange): number[]`, `isInRange(n: number, range: NumberRange): boolean`
  - `allocatedCount(ranges: readonly NumberRange[]): number`
  - `orphanedNumbers(held: readonly number[], range: NumberRange): number[]` (held numbers outside the range)
  - `totalProblem(newTotal: number, highestUsed: number): string | null`

- [ ] **Step 1: Write the failing tests.** Names and assertions: `rangeProblem` returns null for `{keserwan,1,90}` in 408; returns text containing "overlaps" and the other governorate for `{north-lebanon,80,150}` against Keserwan 1-90; returns text for `from > to`, `from < 1`, `to > total`. `nextFreeNumber([{keserwan,1,90}])` is 91 and `nextFreeNumber([])` is 1. `allocatedCount` of 1-90 and 91-150 is 150. `orphanedNumbers([5,95], {1,90})` is `[95]`. `totalProblem(100, 150)` is non-null, `totalProblem(408, 150)` is null.
- [ ] **Step 2: Run** `pnpm --filter @vardenia/core test listing-numbers` — expect FAIL (module missing).
- [ ] **Step 3: Implement** the functions above in `listing-numbers.ts`; plain functions, no dependencies.
- [ ] **Step 4: Run the same command** — expect PASS.
- [ ] **Step 5: Checkpoint.** Run the whole core suite; green.

### Task 2: Submission schema (core)

**Files:**

- Create: `packages/core/src/place-submission.ts`; export from `index.ts`
- Test: `packages/core/src/place-submission.test.ts`

**Interfaces:**

- Consumes: `z` from `./zod`; `TAXONOMY`/`SUBCATEGORY_PARENT`, `GOVERNORATES`, `amenityOptions`, `priceRangeOptions`, `LISTING_GOVERNORATES`.
- Produces: `PAGE_TEMPLATES = ['a','b','c'] as const`; `placeSubmissionSchema` (zod object); `type PlaceSubmission`. Fields: `name` (1-160), `tagline?` (max 120), `description?` (max 2000, plain text), `category`, `subcategories` (array), `governorate` (one of `LISTING_GOVERNORATES`), `district?`, `area?` (positive int), `address` (1-300), `openingHours?` (array of `{day, opens?, closes?, closed}`, 24-hour `HH:MM`), `priceRange?`, `amenities` (array), `payments` (`{cash,card,whish,omt}` booleans), `publicPhone?`, `website?` (http/https), `ownerName`, `ownerEmail` (lowercased, same looseness as `booking-request.ts`), `ownerPhone`, `pageTemplate`, `issue` (positive int), `listingNumber` (positive int), `locale`.
- Produces also: `schema.superRefine` rules: every subcategory belongs to `category`; `district` belongs to `governorate`.

- [ ] **Step 1: Failing tests:** a minimal valid object parses; an unknown key such as `tier` or `_status` is stripped (not present in `result.data`); `subcategories: ['hotels']` with `category: 'food-and-beverage'` fails with the subcategory in the error path; district `'tyre'` with governorate `'beirut'` fails; `ownerEmail: 'A@B.com'` parses to `a@b.com`; `opens: '9am'` fails; `pageTemplate: 'd'` fails.
- [ ] **Step 2: Run** `pnpm --filter @vardenia/core test place-submission` — FAIL.
- [ ] **Step 3: Implement** the schema; use `.strip()` semantics (zod default) so unknown keys are dropped.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Checkpoint.** Whole core suite green.

### Task 3: Ranges collection and issue total

**Files:**

- Create: `apps/web/src/collections/ListingRanges.ts`; Test: `apps/web/src/collections/ListingRanges.test.ts`
- Modify: `apps/web/src/collections/Issues.ts` (add `listingTotal`), `apps/web/src/payload.config.ts` (register `ListingRanges` beside `Issues`)

**Interfaces:**

- Consumes: Task 1 (`rangeProblem`, `orphanedNumbers`, `totalProblem`, `nextFreeNumber`, `DEFAULT_LISTING_TOTAL`, `LISTING_GOVERNORATES`).
- Produces: collection slug `listing-ranges`, label "Listing number ranges", group "Magazine", fields `issue` (relationship to `issues`, required), `governorate` (select of the seven, required), `from` and `to` (integers, required); access `read`, `create`, `update` and `delete` all `isStaff` (the public numbers route reads with `overrideAccess`, so the ranges are not exposed through the REST API). Unique together (`issue`, `governorate`) through `indexes: [{ fields: ['issue','governorate'], unique: true }]`. `issues.listingTotal`: integer, default 408, min 1, staff-editable.
- A `beforeValidate` hook on `listing-ranges` loads the issue's other ranges and calls `rangeProblem`; and, on update, loads held numbers of listings with this `issue` and `governorate` and refuses if `orphanedNumbers(...)` is non-empty, naming the numbers. `from` has `defaultValue` computed with `nextFreeNumber` of the issue's existing ranges when the form is built (same pattern as `QrCodes.code`).
- A `beforeValidate` hook on `issues` refuses `listingTotal` below `totalProblem` of the highest `to` among its ranges.

- [ ] **Step 1: Failing tests** against pure helpers exported from the collection file (`validateRangeAgainstIssue(args)`): returns the overlap message for Keserwan 1-90 vs North 80-150; returns the orphan message naming `95` when shrinking Keserwan to 1-90 while a listing holds 95; passes for North 91-150. Add a `ListingRanges` config test: `access.create` is `isStaff`, and the unique index exists.
- [ ] **Step 2: Run** `pnpm --filter @vardenia/web test ListingRanges` — FAIL.
- [ ] **Step 3: Implement** the collection, the hook, the Issues field and its hook, and register it.
- [ ] **Step 4: Run** the test — PASS. Then `pnpm --filter @vardenia/web typecheck` (types regenerate in Task 9; until then typecheck errors on the new slug are expected, note them).
- [ ] **Step 5: Checkpoint.**

### Task 4: Listing fields, number release, and partner link on publish

**Files:**

- Modify: `apps/web/src/collections/Businesses.ts` (new fields, hooks)
- Create: `apps/web/src/hooks/releaseListingNumber.ts`, `apps/web/src/hooks/linkPartnerOnPublish.ts`
- Test: `apps/web/src/hooks/releaseListingNumber.test.ts`, `apps/web/src/hooks/linkPartnerOnPublish.test.ts`, extend `apps/web/src/collections/Businesses.fields.test.ts`

**Interfaces:**

- Consumes: Task 1 (`isInRange`), Task 3 (`listing-ranges`), `inviteBusinessUser` (existing, fires on partner create).
- Produces on `businesses`: `issue` (relationship to `issues`), `listingNumber` (integer, index), `indexes: [{ fields: ['issue','listingNumber'], unique: true }]`, validation that the number is inside the range of the listing's `governorate` in its `issue`; group `submission` with fields `status` (`pending|approved|rejected`), `ownerName`, `ownerEmail`, `ownerPhone`, `publicPhone`, `website`, `pageTemplate` (`a|b|c`), `submittedAt`, all with `access: { read: isStaffFieldLevel, create: () => false, update: isStaffFieldLevel }` (the public route writes with `overrideAccess`).
- Produces: `releaseListingNumber: CollectionAfterChangeHook` (sets `listingNumber` to null when `submission.status` becomes `rejected` or the document gets a `deletedAt`; uses `context.skipListingRelease` to avoid loops); `linkPartnerOnPublish: CollectionAfterChangeHook`.
- `linkPartnerOnPublish` rules: act only when `previousDoc._status !== 'published'`, `doc._status === 'published'` and `doc.submission?.ownerEmail` exists. Set `submission.status` to `approved`. Find `business-users` by lower-cased `ownerEmail` with `overrideAccess`. If none: create with `name`, `email`, `phone`, `businesses: [doc.id]`, and a random password of at least 32 characters (the existing invite hook sends the set-password email). If found: append `doc.id` to `businesses` only when absent. Never throws; failures go to `reportError` with source `partner.link`.

- [ ] **Step 1: Failing tests.** Release: `rejected` clears the number; a trashed doc clears it; an `approved` doc does not. Link: first publish creates a partner with `businesses: [id]` (assert the create call); second publish (previousDoc already published) does nothing; existing partner with `businesses: [7]` gets `[7, id]`; email matching is case-insensitive; a listing with no `submission.ownerEmail` is ignored. Fields: `submission.status` read access returns false for an anonymous request and true for staff; `listingNumber` outside the range is refused with the range in the message.
- [ ] **Step 2: Run** `pnpm --filter @vardenia/web test releaseListingNumber linkPartnerOnPublish Businesses.fields` — FAIL.
- [ ] **Step 3: Implement** the fields, the two hooks, and add them to `afterChange` (after `ensureQrCode`).
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Checkpoint.**

### Task 5: Availability and submission service

**Files:**

- Create: `apps/web/src/lib/place-submission.ts`; Test: `apps/web/src/lib/place-submission.test.ts`

**Interfaces:**

- Consumes: Tasks 1-4, `Payload` from `payload`.
- Produces:
  - `listNumbersFor(payload: Payload, governorate: string): Promise<Array<{ issueId: number; issueTitle: string; from: number; to: number; taken: number[] }>>` (never returns holders' identities; counts a number as taken when a non-trashed listing of that issue holds it).
  - `type SubmissionFiles = { hero: File; gallery: File[]; logo?: File }`
  - `createPlaceSubmission(args: { payload: Payload; input: PlaceSubmission; files: SubmissionFiles }): Promise<{ ok: true; listingId: number } | { ok: false; code: 'number-unavailable' | 'no-range' | 'invalid-files' | 'error'; message: string }>`
- Behaviour: re-checks that the issue has a range for the governorate and that `isInRange` holds (`no-range` / `number-unavailable`); validates files (JPEG, PNG or WebP, at most 25 MB each, at most 6 gallery files) before creating anything; creates media with `overrideAccess: true`; creates the listing with `overrideAccess: true` and data built only from the allow-list: `_status: 'draft'`, `tier` left to its default, no `verified`, `contract*`, `commission`, `qrCode`, `importBatch`, `slug`; description converted with `richText([text])` from `seed/rich-text.ts` logic (copy the small helper into `lib/` rather than importing from seed); sets `submission` to `{ status: 'pending', ownerName, ownerEmail, ownerPhone, publicPhone, website, pageTemplate, submittedAt: now }`; maps a unique-violation on `(issue, listing_number)` to `number-unavailable`.

- [ ] **Step 1: Failing tests** with a stub payload: `listNumbersFor` returns the range and the taken list for beirut; `createPlaceSubmission` refuses a number outside the range (`number-unavailable`) without creating media; refuses a governorate with no range (`no-range`); ignores smuggled keys (`tier`, `_status`, `verified`, `qrCode`) because the data passed to `payload.create` contains none of them and `_status` equals `'draft'`; a unique-violation error from `create` returns `number-unavailable`; an oversized file returns `invalid-files` and nothing is created.
- [ ] **Step 2: Run** `pnpm --filter @vardenia/web test place-submission` — FAIL.
- [ ] **Step 3: Implement** both functions.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Checkpoint.**

### Task 6: Public routes, path registration, notifications

**Files:**

- Create: `apps/web/src/app/place-submissions/route.ts`, `apps/web/src/app/place-submissions/numbers/route.ts`, `apps/web/src/lib/place-submission-email.ts`
- Test: `apps/web/src/lib/place-submission-email.test.ts`
- Modify: `apps/web/src/lib/known-paths.ts` (add `'place-submissions'` to `UNMATCHED_PREFIXES`), `apps/web/src/proxy.ts` (add `place-submissions` to the `matcher` exclusion list), and the tests `known-paths.test.ts`/`proxy.test.ts` if they enumerate prefixes.

**Interfaces:**

- Consumes: Task 5; `withRateLimit` and `RATE_LIMIT` from `lib/rate-limit` (shared, Postgres-counted, like `/booking/request`); `verifyTurnstile` from `lib/turnstile`; `placeSubmissionSchema`.
- Produces: `GET /place-submissions/numbers?governorate=<slug>` returning `{ ok: true, issues: [...] }` from `listNumbersFor`, `cache-control: no-store`, 400 for an unknown governorate; `POST /place-submissions` (multipart: field `data` is JSON, files `hero`, `gallery`, `logo`, plus `turnstile`) returning 201 `{ ok: true }`, 400 `{ ok: false, errors }` (via `fieldErrors`), 403 on Turnstile rejection, 409 `{ ok: false, code: 'number-unavailable' }`, 413 on oversize.
- Produces: `placeSubmissionEmails(args): { team: { subject: string; html: string }; owner: { subject: string; html: string } }` following `booking-email.ts` (palette from `email-palette`, English and Arabic owner copy). The route sends both after success with `payload.sendEmail`, awaited, failure reported and never undoing the draft; the team address comes from the existing contact or admin-notification setting used by `notifyNewError` (read it before choosing).

- [ ] **Step 1: Failing tests:** `placeSubmissionEmails` team html contains the business name, governorate and number and a link to `/admin/collections/businesses/<id>`; owner copy exists for `en` and `ar` and contains no admin link; `isUnknownTopLevelPath('/place-submissions', locales)` is false; the proxy matcher excludes `place-submissions`.
- [ ] **Step 2: Run** `pnpm --filter @vardenia/web test place-submission-email known-paths proxy` — FAIL.
- [ ] **Step 3: Implement** the email builder, the two route files (same shape as `app/booking/request/route.ts`: JSON helper, `dynamic = 'force-dynamic'`), and the registrations.
- [ ] **Step 4: Run** the same command — PASS.
- [ ] **Step 5: Manual check** (needs the dev database): `curl -s 'localhost:3000/place-submissions/numbers?governorate=keserwan'` returns the range once an admin has created the "All Lebanon" issue and its ranges. Report what was seen.

### Task 7: Page preview components

**Files:**

- Create: `apps/web/src/components/places/BusinessPagePreview.tsx`, `PageTemplateA.tsx`, `PageTemplateB.tsx`, `PageTemplateC.tsx`, `preview-model.ts`
- Test: `apps/web/src/components/places/BusinessPagePreview.test.tsx`, `preview-model.test.ts`

**Interfaces:**

- Produces: `interface PreviewData { name: string; tagline: string; description: string; category: string; governorate: string; address: string; hours: string; phone: string; amenities: string[]; heroUrl?: string; galleryUrls: string[]; logoUrl?: string; listingNumber?: number; locale: Locale }`; `emptyPreview(locale: Locale): PreviewData`; `<BusinessPagePreview template={'a'|'b'|'c'} data={PreviewData} />` renders an A4 portrait page (CSS custom property `--page-ratio: 210 / 297`, one place to change it) using tokens from `@vardenia/tokens`, serif for titles and sans for body, logical CSS properties, `dir` from `dirFor(locale)`.
- Behaviour: the three layouts follow the approved mockups (A hero on top, B title plus gallery, C full-page photo with a text band). Empty fields show a light placeholder, never "undefined". The page number reads `VARDENIA - {listingNumber}` and is blank when unset. Long text is clamped to fit the page.

- [ ] **Step 1: Failing tests** with `renderToStaticMarkup`: each template renders the name and the number; a template with `emptyPreview` contains no "undefined"; Arabic data renders with `dir="rtl"`; a 5000-character description does not appear in full (clamped).
- [ ] **Step 2: Run** `pnpm --filter @vardenia/web test BusinessPagePreview preview-model` — FAIL.
- [ ] **Step 3: Implement** the model and components.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Checkpoint.**

### Task 8: The form, number picker, and page wiring

**Files:**

- Create: `apps/web/src/components/places/PlaceSubmissionForm.tsx`, `NumberPicker.tsx`, `use-place-numbers.ts`
- Modify: `apps/web/src/app/(frontend)/[locale]/magazine-places/page.tsx` (replace the form placeholder, keep the viewer placeholder; preview goes above the form), `packages/i18n/src/messages/en.json` and `ar.json` (extend the `magazinePlaces` namespace)
- Test: `apps/web/src/components/places/NumberPicker.test.tsx`, `PlaceSubmissionForm.test.tsx`

**Interfaces:**

- Consumes: Task 7 (`BusinessPagePreview`, `PreviewData`), Task 6 routes, `Turnstile` component, `formStyles`, `placeSubmissionSchema` for client checks.
- Produces: `<NumberPicker issues={NumbersIssue[]} value={number | null} onChange={(issueId:number, n:number)=>void} />` — shows every number in the range, taken ones disabled with an accessible "taken" label, and an explicit message when the list is empty or full; `usePlaceNumbers(governorate: string): { state: 'idle'|'loading'|'ready'|'error'; issues: NumbersIssue[] }` (fetches `/place-submissions/numbers`, `no-store`); `<PlaceSubmissionForm locale={Locale} />` — template radio (A/B/C), all fields from the schema, image previews through object URLs revoked on unmount, a Preview button that scrolls to the page, a Submit button that posts multipart and shows success, field errors, "number taken" (and refreshes the picker), and rate-limit messages.

- [ ] **Step 1: Failing tests:** `NumberPicker` renders 1..90 for Keserwan with `taken=[3]` and number 3 is `disabled` with its "taken" label; shows the "no numbers left" message when all are taken; the form disables Submit until a number is chosen; choosing template `c` passes `c` to the preview; with `locale="ar"` the form root has `dir="rtl"`.
- [ ] **Step 2: Run** `pnpm --filter @vardenia/web test NumberPicker PlaceSubmissionForm` — FAIL.
- [ ] **Step 3: Implement** the components, the page wiring, and the English and Arabic strings (every string through `useTranslations('magazinePlaces')`; keep the keys identical in both files).
- [ ] **Step 4: Run** — PASS. Then `pnpm --filter @vardenia/web typecheck` and `pnpm --filter @vardenia/web lint`.
- [ ] **Step 5: Manual check** in the browser at `/magazine-places` and `/ar/magazine-places`: pick a governorate, see numbers, pick one, switch templates, submit, then find the draft under Directory > Listings with `submission.status = pending`. Report what was seen; say what was not checked.

### Task 9: Migration, types, and admin counter

**Files:**

- Create: `apps/web/src/migrations/<timestamp>_business_submissions.ts` and `.json` (generated), `apps/web/src/components/admin/ListingAllocation.tsx`
- Modify: `apps/web/src/migrations/index.ts`, `apps/web/src/payload-types.ts` (regenerated), `apps/web/src/collections/Issues.ts` (a `ui` field using the counter)

**Interfaces:**

- Produces: a migration adding `listing_ranges`, the new `issues` and `businesses` columns, the two unique indexes, row-level security on the new table (same as `20261119_090456_magazine_places.ts`); `ListingAllocation` server component showing "N of TOTAL allocated, next free number M" for an issue, from `allocatedCount` and `nextFreeNumber`.

- [ ] **Step 1: Regenerate types** with `pnpm --filter @vardenia/web generate:types`; run typecheck; fix any call sites.
- [ ] **Step 2: Create the migration** with `pnpm --filter @vardenia/web migrate:create business_submissions` against the **development** database only; open the SQL and confirm it contains only additions plus RLS, and the unique index on `(issue_id, listing_number)`; add RLS for `listing_ranges` by hand if the generator omitted it.
- [ ] **Step 3: Implement** `ListingAllocation` and add it to `Issues`.
- [ ] **Step 4: Verify** on a clean dev database: `pnpm --filter @vardenia/web migrate` succeeds, then in the admin create the issue "All Lebanon" (total 408), add Keserwan 1-90, confirm the next row pre-fills 91, confirm an overlapping row is refused and the counter reads "90 of 408 allocated".
- [ ] **Step 5: Full run:** `pnpm --filter @vardenia/web test`, `pnpm --filter @vardenia/core test`, typecheck, lint. All green, or list the failures. Do not run the migration against staging or production; that is the tech lead's step.
