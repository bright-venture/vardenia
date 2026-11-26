# Templates, Slots and Layout Pricing Implementation Plan (PRD v7)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An admin builds a locked **template** (ordered pages, each with one of five layouts). An **issue** uses a template, copies its **slots** (listings), splits its pages into **governorate blocks** and prices each layout. The owner picks governorate → issue → layout → a free slot (shown as "Page 62, position 3"), the layout and slot are stored once and never change, and staff see layout, page, price and money per business.

**Spec:** `/home/boush/Downloads/Vardenia-Magazine-Places-Layouts-Pricing-PRD-v7.pdf` (backend PRD v7). It replaces v6. Extends PRD v5 (payment engine, unchanged).

**Status of earlier work (v6 build, uncommitted in the working tree):** Tasks 1 to 3 were built and (1, 2) reviewed against v6, where layouts had number ranges. They are being **reworked** here. Keep what v7 still needs: `PAGE_LAYOUTS`, labels, `isPageLayout`, `layout` in the core submission schema, the `pageLayout` field and `guardPageLayout` write-once logic, the payment snapshot (`submission.payment.price` / `downpaymentAmount`), finish/terms/email changes, `layout-unavailable` / `number-unavailable` errors. Replace the per-layout number-range model.

**Nothing is committed in this work. Do not run `git commit`, and do not run migrations or write to any real database.** The migration `20261126_120000_page_layouts` has never been run anywhere, so rewrite it in place.

**Tech Stack:** Payload 3.90 (Postgres), Next 16, zod, vitest, pnpm monorepo (`packages/core`, `apps/web`).

## Global Constraints

- Layouts, in this order, fixed in code, same for every issue: `full-spread` "Full spread" (2 pages, 1 slot), `full-page` "Full page" (1 page, 1 slot), `half-page` "Half page" (1 page, 2 slots), `three-third` "Three third" (1 page, 3 slots), `quarter-page` "1/4" (1 page, 4 slots). One layout per page. A spread takes two consecutive pages and is one template entry.
- Template: name + ordered pages (layout each). Totals are calculated, never typed: total pages = sum of pages used (spread = 2), total listings = sum of slots. At least one page.
- Slots: walk the pages in order; each slot gets the next listing number from 1, `page` (first page of its page, 1-based), `position` (1 up to the layout's slot count in order; `null` for full page and spread) and `layout`. Same template always gives the same slots. A spread slot covers `page` and `page + 1`.
- A template is locked once an issue links it: no edit to its pages, no delete, by anyone (hook, not only hidden fields). Duplicate (Payload's) gives an editable copy and must come out unlocked.
- Issue copies the slots when a template is assigned (snapshot): later template changes cannot move a sold slot. Issue `listingTotal` = slot count and `pageCount` = template total pages. Once any business holds a number in the issue, its template and slots cannot change. Issues without a template (legacy) keep today's behaviour (typed `listingTotal`, manual number ranges) and offer no layouts.
- Issue price table (`layouts`, staff-only read): per layout `offered`, `price` (finite, at least 1). No from/to. A layout is offered only when switched on, priced, and it has at least one slot in the issue. A layout with held slots cannot be switched off or removed.
- Governorate blocks: the existing `ListingRanges` collection keeps governorate, `from`, `to` (so held-number logic, unique guarantee and `isInRange` keep working) and gains `firstPage` / `lastPage`. For an issue with slots, the admin enters pages and a hook DERIVES `from`/`to` from the slots on those pages (slots are numbered in page order, so a page block is a contiguous number range). Blocks do not overlap, stay inside the template's pages, and no spread straddles a block edge (plain message). For issues without slots the manual numbers stay as today.
- One listing number = one business (DB guarantee untouched). A start requires issue, layout and number; the number must be a slot of that layout in that issue, inside the governorate's block, and free.
- Price at least 1. Currency from Settings. Downpayment = `downpaymentFor(price, settings.downpaymentPercent)` (existing). Price snapshot on the draft; terms and finish read it; legacy drafts use Settings `pricePerYear`.
- Layout is write-once: no update by anyone (API, admin, scripts, `overrideAccess` included). Only the start route sets it, on create. A staff edit of a business's number or issue must land on a slot of the same layout, inside the business's governorate block.
- Browser input never carries price, template or tier. Tiers untouched (default silver).
- Positions are shown as text only: "Page 62, position 3" (spread: "Pages 62-63"; no position for full page/spread). No diagrams.
- Frontend: no redesign. Existing styles/components.
- Follow existing code style: comments explain why; tests next to the file; `reportError` for unexpected failures.

## Review Focus

- Slot generation correctness: totals, numbering, spread double page, positions; determinism.
- Template locking is enforced on every write path; duplicate comes out unlocked; slot snapshot never changes after a business holds a number.
- Governorate page block → derived number range; spread straddling refused; overlap refused.
- Last slot of a layout taken by two screens: second refused cleanly (existing unique index), offered next free slots of that layout.
- Admin edits a price after Next: started form keeps its snapshot.
- A write that sets a different `pageLayout` or moves the number to a slot of another layout/outside the block: refused.
- Legacy business/draft/issue with no layout/template: still works; dash in admin.

## File Structure

- `packages/core/src/page-layouts.ts` (+ test): layouts table, `buildSlots`, `templateTotals`, `templateProblem`, price-row rules, `layoutSlots`, `slotLabel`.
- `packages/core/src/place-submission.ts` (+ test): `layout` in the schema (kept).
- New collection `apps/web/src/collections/Templates.ts` (+ test) registered in `payload.config.ts`; `Issues.ts` (+ test), `ListingRanges.ts` (+ test), `Businesses.ts`, `hooks/guardPageLayout.ts` (+ test).
- Migration `20261126_120000_page_layouts.ts` + `.json` rewritten, `migrations/index.ts`, `payload-types.ts` regenerated.
- `lib/place-submission.ts`, `lib/place-submission-finish.ts`, `app/place-submissions/numbers/route.ts`, `app/place-submissions/route.ts`, `terms/route.ts`, `lib/place-payment-email.ts` (+ tests).
- Admin cells/panel/report files, `seed/page-layouts.ts` (Task 4); form pieces + i18n (Task 5).

---

### Task 1: Core rules for layouts, templates and slots (rework)

**Files:** Modify `packages/core/src/page-layouts.ts`, `page-layouts.test.ts`, `index.ts`.

**Interfaces:**

- Keep: `PAGE_LAYOUTS`, `PageLayout`, `PAGE_LAYOUT_LABELS`, `isPageLayout`.
- Add: `LAYOUT_SHAPE: Record<PageLayout,{pages:1|2;slots:1|2|3|4}>`; `interface TemplatePage {layout: PageLayout}`; `interface Slot {number:number;page:number;position:number|null;layout:PageLayout}`; `buildSlots(pages: readonly TemplatePage[]): Slot[]`; `templateTotals(pages): {pages:number;listings:number}`; `templateProblem(pages): string | null` (empty list, unknown layout); `slotLastPage(slot): number` (page+1 for spread); `slotLabel(slot): string` returns "Page 62, position 3", "Page 12", "Pages 62-63" (English, for admin/emails; the form uses i18n parts); `interface PriceRow {layout; offered:boolean; price:number|null}`; `priceRowsProblem(rows): string | null` (unknown/duplicate layout, price not finite or < 1 when offered or present); `isOffered(row, slots): boolean` (offered, priced, at least one slot of that layout); `layoutSlots(slots, layout, range:{from:number;to:number}|null): Slot[]` (slots of that layout, restricted to the number range when given); `priceRowsDropped(before: PriceRow[], after: PriceRow[], heldByLayout: Record<string,number>): string | null` (switching off or removing a layout that has held slots); `blockProblem(slots, block:{firstPage;lastPage}, totalPages): string | null` (outside 1..total, first > last, or a spread cut by an edge); `blockNumbers(slots, block): {from:number;to:number} | null`; `blocksOverlap(blocks): string | null`.
- Remove range rules from v6 (`layoutRowsProblem`, `layoutRowsDropped`, `orphanedByLayout`, `layoutNumbers`) and update every importer (they are rebuilt in Tasks 2-3, so web may not typecheck until then: leave the web typecheck to those tasks, run core tests and core typecheck only).

- [ ] **Step 1: Write failing tests** for: totals (spread counts 2 pages / 1 listing; half 2; three 3; quarter 4), numbering from 1 in page order with correct `page` (spread advances 2 pages), positions (1..n; null for single-slot layouts), determinism, `templateProblem` empty list, `slotLabel` three forms, price rules (below 1, non-finite, duplicate), `isOffered` (needs offered+price+a slot), `priceRowsDropped`, `blockProblem` (out of range, first>last, spread cut at either edge, accepted aligned block), `blockNumbers` contiguous from/to and null for an empty block, `blocksOverlap`.
- [ ] **Step 2:** `pnpm --filter @vardenia/core exec vitest run page-layouts` — FAIL.
- [ ] **Step 3: Implement.** **Step 4:** tests PASS, `pnpm --filter @vardenia/core typecheck`.

---

### Task 2: Data model, locking, immutability, migration (rework)

**Files:**

- Create: `apps/web/src/collections/Templates.ts` (+ `Templates.test.ts`); register in `apps/web/src/payload.config.ts` next to Issues (admin group like Issues).
- Modify: `collections/Issues.ts` (+ `Issues.layouts.test.ts`), `collections/ListingRanges.ts` (+ test), `collections/Businesses.ts`, `hooks/guardPageLayout.ts` (+ test), migration `20261126_120000_page_layouts.ts` and `.json`, `payload-types.ts` (regenerate), `guardSort.test.ts` / `guardPartnerListingWrite.test.ts` (add the staff-only `pageLayout` field where those lists need it).

**Interfaces:**

- Consumes: Task 1.
- Produces:
  - `templates`: `name` (text, required), `pages` (array of `{layout: select of the five}`, min 1, staff), `locked` (checkbox, read-only in admin, `access.update: () => false` for everyone), calculated read-only display of total pages / listings and the slot list (UI field or description; computed from `pages`). Hooks: `beforeChange` refuses changing `pages` (add/remove/reorder/edit) or `name`-independent structure when the stored doc is `locked` (plain message: "This template is used by an issue and cannot be edited. Duplicate it to make a changed copy."); `beforeValidate` runs `templateProblem`; `beforeDelete` refuses when locked; duplicate (data copy) must set `locked: false`. `locked` is set to true by an Issues hook (below) using `overrideAccess`.
  - `issues`: `template` becomes a relationship to `templates` (replace the select); `slots` (json, staff-only read, written only by the hook, `access.update: () => false`); `layouts` array becomes the price table `{layout (required), offered (default false), price (min 1)}` (remove `from`/`to`); `listingTotal` and `pageCount` set from the template when assigned. Hook (`beforeChange`) when `template` is set or changed: load the template (`overrideAccess`), refuse when any business holds a number in this issue and the template changes (plain message), else snapshot `slots = buildSlots(pages)`, set `listingTotal`, `pageCount`; after the issue saves with a template, set `templates.locked = true` (`afterChange`, `overrideAccess`). Price table validation: `priceRowsProblem`, `priceRowsDropped` with held numbers per layout (derive held per layout from businesses `pageLayout` of that issue with a number, not trashed). Keep `checkListingTotal`.
  - `listing-ranges`: add `firstPage` / `lastPage` (numbers, optional; required when the issue has slots). In its existing `checkRange` flow: for an issue with slots, validate with `blockProblem` and `blocksOverlap` against the issue's other blocks, then set `from`/`to` from `blockNumbers` (the `from`/`to` fields become read-only in admin when the issue has slots; keep them editable otherwise). Existing held-number shrink protection stays.
  - `businesses`: `pageLayout` (keep), `submission.terms.layout`, `.issue`, add `.page` (text). `guardPageLayout` change: on a number or issue change of a document with a layout, the new number must be a slot of that layout in the target issue (slots read with `overrideAccess`) and inside the governorate's block (existing logic continues to check the block). Write-once rule unchanged.
  - Migration (rewrite in place, never run): enum types for template-less items; `templates` table (`id`, `name`, `locked`, timestamps) + `templates_pages` (`_order`,`_parent_id`,`id`,`layout` enum); `issues`: `template_id` integer FK to templates (replacing the enum column), `slots` jsonb; `issues_layouts` table with `layout`, `offered`, `price` only; `listing_ranges.first_page`, `last_page`; `businesses.page_layout` enum, `submission_terms_layout`, `submission_terms_issue`, `submission_terms_page` varchar; `SET LOCAL lock_timeout = '5s'` FIRST in the script; `ADD COLUMN IF NOT EXISTS`; `down`; also the payload locked-documents / preferences relation columns Payload adds for a new collection (copy how a recent migration that added a collection did it, e.g. check `20261125*`/earlier migrations for `payload_locked_documents_rels`). Snapshot JSON updated to match. No data change to existing issues (they simply have no template).

- [ ] **Step 1: Write failing tests**: Templates: refuses edits to pages when locked, allows when unlocked, refuses delete when locked, duplicate unlocked, empty pages refused. Issues: assigning a template snapshots slots and sets total/pageCount; changing template refused once a business holds a number; price rows rules (price < 1, switching off a layout with held slots refused); issue hook locks the template (injected lookup style as existing tests). ListingRanges: pages → derived from/to; overlap refused; spread straddle refused; legacy issue without slots keeps manual numbers. Guard: number change to a slot of another layout refused, same layout inside block allowed; documents with no layout untouched; write-once unchanged.
- [ ] **Step 2:** `pnpm --filter @vardenia/web exec vitest run Templates Issues ListingRanges guardPageLayout guardSort guardPartnerListingWrite` — FAIL.
- [ ] **Step 3: Implement.** Regenerate types (`pnpm --filter @vardenia/web generate:types`). **Do not run the migration.**
- [ ] **Step 4:** Those tests PASS; `pnpm --filter @vardenia/web typecheck` (web typecheck may still fail in `lib/place-submission.ts` and the numbers route until Task 3; list any failures outside Task 2 files in the report).

---

### Task 3: Backend routes and services (rework)

**Files:** `apps/web/src/lib/place-submission.ts` (+ test), `app/place-submissions/numbers/route.ts` (+ test), `app/place-submissions/route.ts` (+ test); `lib/place-submission-finish.ts`, `terms/route.ts`, `lib/place-payment-email.ts` stay except as listed.

**Interfaces:**

- Consumes: Tasks 1, 2 (and the existing payment snapshot, finish, terms and email work from the v6 build).
- Produces:
  - `listNumbersFor(payload, governorate)` per issue that has a block for the governorate: `{ issueId, issueTitle, from, to, taken, layouts: Array<{ layout; price; downpaymentAmount; slots: Array<{ number; page; position: number|null; lastPage: number }>; free: number }> }` where `slots` are the FREE slots of that layout inside the governorate's block (page/position/last page for the label), `free = slots.length`. A layout with zero free slots is reported with `free: 0` and `slots: []` (not hidden). A layout appears only when `isOffered`. Issues without slots (legacy) return `layouts: []`. Numbers only, never who holds them. Slots read with `overrideAccess`.
  - `startPlaceSubmission` (input still has `issue`, `layout`, `listingNumber`, `governorate`): refuses `layout-unavailable` when the layout is not offered/priced for the issue; `number-unavailable` when the number is not a slot of that layout in the issue, outside the governorate's block, or held. Draft creation, `pageLayout`, price snapshot and result (`price`, `downpaymentAmount`, `currency`) as already built. The terms snapshot gets `page` (text from `slotLabel`) as well as layout and issue.
  - Everything else from the v6 build stays.

- [ ] **Step 1: Write failing tests**: numbers returns slots with page/position for free slots of an offered layout in the block, `free: 0` for a full layout, omits unoffered/unpriced layouts, issues with no block for the governorate absent, legacy issue `layouts: []`, no owner data; start refuses a number that is a slot of another layout, a slot outside the block, a held slot, a missing layout; valid start unchanged; the page text reaches the terms snapshot.
- [ ] **Step 2:** `pnpm --filter @vardenia/web exec vitest run place-submission numbers place-payment-email` — FAIL.
- [ ] **Step 3: Implement.** **Step 4:** PASS; `pnpm --filter @vardenia/web typecheck` clean; then the full `pnpm --filter @vardenia/web exec vitest run`, listing any failures (frontend ones are Task 5's).

---

### Task 4: Admin visibility, report and staging test data

**Files:**

- Modify: `apps/web/src/components/admin/SubmissionCells.tsx` (the issue-and-page cell shows the layout label and the page), `components/admin/PaymentReviewPanel.tsx` (header shows layout, price, received, still to pay; no layout edit control), `lib/place-reports.ts` + its test and the reports page component (new table), `lib/submission-queues.ts` only if a layout filter chip is simpler than the native filter (native `where` on `pageLayout` already works because it is a select; do not add a chip unless the native one fails)
- Create: `apps/web/src/seed/page-layouts.ts` (+ `package.json` script `seed:layouts`)

**Interfaces:**

- Consumes: Task 2 fields, Task 1 labels.
- Produces: `layoutSales(businesses: readonly ReportBusiness[], issues: readonly {id:number;title:string;slots:Slot[]}[]): Array<{ issueId:number; issueTitle:string; layout:PageLayout; slots:number; held:number; sold:number; expected:number; received:number }>` in `lib/place-reports.ts` (held = businesses holding a number in that layout and live statuses, sold = fully paid or published, expected = sum of snapshot prices of held, received = sum of recorded money not voided/refunded), plus `ReportBusiness` gaining `pageLayout`, and `PlaceReports.layoutSales`.
- Seed: `seed/page-layouts.ts` dry-run by default, `--apply` writes, guarded by `assertSeedTarget()` (same as `seed/listing-ranges.ts`). Creates a sample template named "Sample template (test values)" (spread of pages, then full pages, halves, thirds, quarters, enough to total about 100 pages and a few hundred listings; unlocked), and only when no template with that name exists. Then, for the issue titled "All Lebanon" only when it has no template and no business holds a number: links the template (via the same snapshot logic, call the shared helper, do not duplicate it), fills the price table with placeholder prices (clearly commented as test values: full-spread 3000, full-page 1500, half-page 800, three-third 600, quarter-page 300, all offered) and creates governorate page blocks for the seven governorates that split the pages with no straddled spread. Never overwrites existing data.

- [ ] **Step 1: Write failing tests**: `layoutSales` sums per issue and layout, handles legacy rows without layout (skipped), and a layout with no businesses shows zeros; the cell renders the layout label and page and a dash when absent.
- [ ] **Step 2:** Run `pnpm --filter @vardenia/web exec vitest run place-reports SubmissionCells` — FAIL.
- [ ] **Step 3: Implement**; add the report table to the existing reports page in the same style; add the seed script.
- [ ] **Step 4:** Run tests — PASS; typecheck. Run the seed script **only in dry-run without a database being required** if it needs none; otherwise do not run it.

---

### Task 5: Minimum frontend to test the flow

**Files:**

- Modify: `components/places/use-place-numbers.ts` (+ test), `components/places/form-model.ts` (+ test), `components/places/PlaceSubmissionForm.tsx` (+ test), `components/places/TermsStep.tsx`, `components/places/submit-client.ts` (+ test), the i18n messages in `packages/i18n/src/messages/*.json` (`magazinePlaces` namespace)

**Interfaces:**

- Consumes: Task 3 response shapes.
- Produces: `NumbersIssue.layouts: NumbersLayout[]` with free `slots` (number, page, position, lastPage; parsed defensively like today); `issuesForLayout(issues, layout)` returns each issue that offers the layout with that layout's price and its free slots (`[]` when `layout` is null); the number picker lists free slots as text "Page 62, position 3" (no position when null; "Pages 62-63" for a spread, built from i18n keys), choosing one sets the listing number; `FormState.layout: PageLayout | null`; request data adds `layout`; start result carries `price`, `downpaymentAmount`, `currency`, and TermsStep uses them over the Settings values from `fetchTerms` (`{...terms, price, downpaymentAmount, currency}`).

- [ ] **Step 1: Write failing tests**: parse keeps layouts and drops malformed ones; `issuesForLayout(null)` is empty; with a layout it returns that layout's free slots and price per issue; the request body contains `layout`; changing the layout clears the picked number; the picker shows a "choose a layout first" notice while no layout is chosen; the terms step shows the start result's price.
- [ ] **Step 2:** Run `pnpm --filter @vardenia/web exec vitest run use-place-numbers form-model PlaceSubmissionForm submit-client` — FAIL.
- [ ] **Step 3: Implement.** In the form, add one plain radio group (existing `legend`, label and input styles, same markup patterns as the template radios) above the picker with the five layout labels, no preview or visual redesign. Show the price in each issue's heading inside the picker data (reuse the heading line; add the price text). Add i18n keys for the legend, the five labels, "choose a layout first", and the price text to **every** locale file in `packages/i18n` (English text for non-English locales, listed in the report as needing native review; follow whatever parity test exists). Leave the A/B/C choice exactly as it is.
- [ ] **Step 4:** Run those tests — PASS; `pnpm --filter @vardenia/web typecheck` and `pnpm --filter @vardenia/web lint`.

---

### Task 6: Whole-branch verification

- [ ] `pnpm -r typecheck`, `pnpm -r lint`, `pnpm --filter @vardenia/core test`, `pnpm --filter @vardenia/web test`; all green, including all existing v5 payment tests and the i18n parity test.
- [ ] Report which checks need a real database and were not run: migration up/down/up, concurrent starts on the last slot, price edited mid-form, template locking through Payload's real hook order, `derive from/to` on ListingRanges.
