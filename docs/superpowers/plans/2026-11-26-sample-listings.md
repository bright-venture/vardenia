# Sample Listings Flag Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mark every existing (mock) business as a sample with no magazine number, default new businesses to real, and let an admin toggle the flag.

**Architecture:** One boolean column `is_sample` on `payload.businesses` (Payload checkbox `isSample`), added and back-filled by a last-in-order migration that deploy-migrate.sh applies on the production deploy. The existing `releaseListingNumber` beforeChange hook also clears the number when the listing is a sample. Admin list gets "Sample listings" and "Real listings" chips.

**Tech Stack:** Payload CMS (Postgres adapter), Next.js app `apps/web`, vitest.

**Spec:** `docs/superpowers/specs/2026-11-26-sample-listings-design.md`

## Global Constraints

- Field name `isSample`, column `is_sample boolean NOT NULL DEFAULT false`, table `"payload"."businesses"`.
- Admin-only update (`isAdminFieldLevel`, already imported in `collections/Businesses.ts`); public form route must never set it.
- NO public badge; public site unchanged. NO backup table; `down` only drops the column.
- Migration must be additive, idempotent, and run last (after `20261125_100000_business_pages_merged`). Back-fill only when the column was just added.
- Unticking the flag never restores a number.

## Review Focus

- A real business (isSample false) with a number keeps it: hook must not touch it.
- Create with `isSample: true` AND a number supplied: number is dropped.
- Partial update of a sample listing that does not mention `isSample` (reads `originalDoc`): number stays null.
- Migration run twice: second run changes nothing (real rows created in between stay false).
- Trashed sample listing restored: still no number.

---

### Task 1: Field and number guard

**Files:**

- Modify: `apps/web/src/collections/Businesses.ts` (add field after `listingNumber`, ~line 1024)
- Modify: `apps/web/src/hooks/releaseListingNumber.ts`
- Test: `apps/web/src/hooks/releaseListingNumber.test.ts`, `apps/web/src/collections/Businesses.fields.test.ts`

**Interfaces:**

- Produces: collection field `isSample: boolean` on businesses; `releaseListingNumber` also returns `{ ...data, listingNumber: null }` when `data.isSample ?? originalDoc.isSample` is true.

- [ ] **Step 1: Write failing tests** in `releaseListingNumber.test.ts`: `clears the number when isSample is true` (`run({ isSample: true, listingNumber: 5 }).listingNumber === null`); `clears it on a partial update of a stored sample` (`run({ name: 'x' }, { isSample: true, listingNumber: 5 }).listingNumber === null`); `keeps the number of a real listing` (`run(data, { isSample: false, listingNumber: 5 })` returns `data` unchanged); `unticking does not restore a number` (`run({ isSample: false }, { isSample: true, listingNumber: null })` has `listingNumber` undefined). In `Businesses.fields.test.ts` (follow its existing style): `isSample` field exists, type `checkbox`, `defaultValue` false, and its `access.update` is `isAdminFieldLevel`, with `access.create` also admin-only.
- [ ] **Step 2: Run** `pnpm --filter @vardenia/web vitest run src/hooks/releaseListingNumber.test.ts src/collections/Businesses.fields.test.ts`. Expected: new tests FAIL.
- [ ] **Step 3: Implement** the field (`name: 'isSample'`, label `Sample listing`, `type: 'checkbox'`, `defaultValue: false`, `index: false`, admin sidebar, description "Mock listing shown to visitors but not a real business. Holds no magazine number. Admin only.") and the hook change (a `const sample = (data?.isSample ?? originalDoc?.isSample) === true` clause in the existing condition).
- [ ] **Step 4: Run** the same command. Expected: PASS. Also run `pnpm --filter @vardenia/web typecheck` (generate types first if the repo needs it: `pnpm --filter @vardenia/web generate:types`).
- [ ] **Step 5: Commit** `git add apps/web/src/collections/Businesses.ts apps/web/src/hooks && git commit -m "Add the isSample flag and keep sample listings without a number"`

### Task 2: Migration

**Files:**

- Create: `apps/web/src/migrations/20261126_100000_sample_listings.ts` (+ the `.json` snapshot Payload writes)
- Modify: `apps/web/src/migrations/index.ts` (import and append entry `20261126_100000_sample_listings` LAST)

**Interfaces:**

- Produces: exported `up({ db })` / `down({ db })` in the style of `20261125_100000_business_pages_merged.ts`.

- [ ] **Step 1:** Generate the snapshot and skeleton on a scratch/dev database (see `docs/DATABASE-SETUP.md`): `pnpm --filter @vardenia/web migrate:create sample_listings`. Keep its `.json`; rename files to `20261126_100000_sample_listings` if the timestamp differs, and fix the index.ts entry name to match.
- [ ] **Step 2: Implement `up`** as one `db.execute(sql\`...\`)`DO block: if`information_schema.columns`has no`is_sample`on`payload.businesses`, then `ALTER TABLE "payload"."businesses" ADD COLUMN "is_sample" boolean DEFAULT false NOT NULL;`followed by`UPDATE "payload"."businesses" SET "is_sample" = true, "listing_number" = NULL;` (inside the same IF, so a re-run does nothing). Header comment must say: all production listings were mock on 26 Nov 2026, so no backup is kept. **`down`:** `ALTER TABLE "payload"."businesses" DROP COLUMN IF EXISTS "is_sample";` (comment: numbers are not restored).
- [ ] **Step 3: Verify on a scratch Postgres** seeded with two businesses that have numbers: run `pnpm --filter @vardenia/web migrate`; then `select count(*) filter (where is_sample), count(listing_number) from payload.businesses` must give `2, 0`. Insert a third row with `is_sample=false`, run `migrate:down` then `migrate` again: third row must remain... (down drops the column, so instead verify idempotency by running the SQL block twice by hand: second run leaves the third row `false`). Expected: as stated.
- [ ] **Step 4: Commit** the three migration files.

### Task 3: Admin chips and reports

**Files:**

- Modify: `apps/web/src/lib/submission-queues.ts` (`QueueKey`, `COLUMNS`, `whereToSql`, `SUBMISSION_QUEUES`)
- Modify: `apps/web/src/lib/place-reports.ts` (contracts query, ~line 281)
- Test: `apps/web/src/lib/submission-queues.test.ts`, `apps/web/src/lib/place-reports.test.ts` (follow existing style)

**Interfaces:**

- Consumes: field `isSample` from Task 1.
- Produces: `QueueKey` gains `'sample' | 'real'`; chip `sample` where `only({ isSample: { equals: true } })`, chip `real` where `only({ isSample: { not_equals: true } })`; `COLUMNS` gets `isSample: { column: 'is_sample', type: 'boolean' }` and `whereToSql` supports type `'boolean'` (no cast) and operator `not_equals`.

- [ ] **Step 1: Write failing tests:** `whereToSql({ isSample: { equals: true } }, values)` yields `"is_sample" = $1` with `values === [true]`; `not_equals` yields `"is_sample" <> $1`; `SUBMISSION_QUEUES` contains keys `sample` and `real` and the `all` chip still has `where: null`; the `countQuery` text has one more `c<i>` column per new chip. In `place-reports.test.ts`: the contracts query's `where` includes `{ isSample: { not_equals: true } }` (assert via the fake payload's recorded call, as existing tests do).
- [ ] **Step 2: Run** `pnpm --filter @vardenia/web vitest run src/lib/submission-queues.test.ts src/lib/place-reports.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Add the two chips after `all` with labels `Sample listings` / `Real listings` and hints; add them to `QueueKey`; boolean support in `COLUMNS` type union and `whereToSql` (`not_equals` for boolean/text). Add `{ isSample: { not_equals: true } }` to the contracts `and` in `loadPlaceReports`. Check any component that switches over `QueueKey` (grep `QueueKey` in `components/admin`) and give the new keys a render path.
- [ ] **Step 4: Run** the tests, then `pnpm --filter @vardenia/web typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Add Sample listings and Real listings filters and keep samples out of the contract report"`

### Task 4: Check the rest and verify

**Files:** none created; reads only unless a bug is found.

- [ ] **Step 1:** Grep `listingNumber` in `components/admin/magazine-page/*`, `app/qr/sheet/route.ts`, `components/places/preview-model.ts`, the public listing pages, and `lib/dashboard-stats`. For each, confirm a listing with no number (and `isSample`) does not crash or print "null"/"undefined". Write down findings; fix any crash with a test.
- [ ] **Step 2:** Run the whole suite `pnpm --filter @vardenia/web test` and `pnpm --filter @vardenia/web typecheck` and `pnpm --filter @vardenia/web lint`. Expected: all green.
- [ ] **Step 3:** Manual check in the admin on a dev DB: open a business, tick Sample listing, save, confirm Listing number becomes empty; as a staff (non-admin) user confirm the box is read-only. Report the result.
- [ ] **Step 4:** Update the spec's "Staff views" line to say: queues are status-based so mock rows already stay out of them; added Sample/Real chips and the contracts-report exclusion. Commit.
