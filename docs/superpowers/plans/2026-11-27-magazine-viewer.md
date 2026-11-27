# Magazine Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A read-only flipbook of one issue, drawn from the issue's stored slots, where each listing number shows the business that holds it; plus the description returning to the form.

**Architecture:** Pure page/spread maths in `packages/core`; one rate-limited, uncached JSON route that reads the issue's slots/template with server access and returns only printed-page fields; a client viewer (spreads, polling) on a new noindex page. The form changes only by the restored description and one link.

**Tech Stack:** Payload 3, Next.js 16, next-intl, vitest + Testing Library, a pnpm monorepo.

**Spec:** `docs/superpowers/specs/2026-11-27-magazine-viewer-design.md`

## Global Constraints

- Never commit. Never run migrations or seeds against any database. No new migration is needed.
- Do not change issues, listing ranges, numbers, prices, templates, or submission/issue-first logic. The viewer only reads.
- Client code imports narrow `@vardenia/core/<module>` (e.g. `@vardenia/core/magazine-view`), never the barrel (it is exported as `./*`).
- Public data: only the printed-page fields. Never owner e-mail, owner name/phone (`submission.*`), status, payment or ids of users.
- A business is shown only when `submission.status` is one of `awaiting_downpayment`, `pending`, `accepted`, `paid`, `approved` (the owner has submitted and reserved). Never `incomplete`, `abandoned`, `lapsed`, `rejected`, `expired`; never `isSample`.
- All 10 locales (ar bn en es fr hi pt ru ur zh) get every new key; ar/ur render RTL. Arabic is translated; other locales may carry English (as the earlier form keys do).
- Gates for every task: `pnpm -r typecheck`, `pnpm -r test`, `pnpm -r lint` (0 errors), prettier on changed files.

## Review Focus

- A business with status `incomplete`/`abandoned`/`rejected`/`lapsed`/`expired` or `isSample` is never in the route's output; the output keys are a fixed whitelist (a test asserts the exact key set, so no owner data can leak).
- An issue with no template or no slots (made before templates), or an unknown issue id, returns a clean 4xx JSON, not a 500.
- A full spread, an odd page count, and editorial gap pages pair into correct spreads (page 1 alone, then 2-3, 4-5...).
- A business with no photo, no description, a 60-character name or a long description draws a placeholder/clamped card, never crashes or overflows.
- Polling: no overlapping requests, stops on unmount and while the tab is hidden, and a failed poll keeps the last good view instead of blanking it.
- `?number=` for a number that is not in the issue is ignored; the viewer still opens.

---

### Task 1: Page and spread model (core, pure)

**Files:**

- Create: `packages/core/src/magazine-view.ts`, `packages/core/src/magazine-view.test.ts`
- Modify: `packages/core/src/index.ts` (export it)

**Interfaces:**

- Consumes: `Slot`, `PageLayout`, `slotLastPage` from `./page-layouts`.
- Produces:

```ts
export type MagazinePage =
  | { page: number; kind: 'editorial'; note: string | null }
  | {
      page: number
      kind: 'listings'
      layout: PageLayout
      span: 1 | 2
      slots: { number: number; position: number | null }[]
    }
export interface MagazineRegion {
  governorate: string
  firstPage: number
  lastPage: number
}
export type Spread = MagazinePage[] // 1 or 2 entries; a full spread is one entry that spans both sides
export function buildMagazinePages(
  slots: readonly Slot[],
  pageCount: number,
  notes: Record<number, string | null>,
): MagazinePage[]
export function toSpreads(pages: readonly MagazinePage[]): Spread[]
export function regionOfPage(
  regions: readonly MagazineRegion[],
  page: number,
): MagazineRegion | null
export function spreadIndexOfPage(spreads: readonly Spread[], page: number): number // -1 if absent
```

- [ ] **Step 1: Write failing tests** covering: pages 1..pageCount each appear once; a page with no slot is `editorial` with its `notes[page]` (null when absent); slots on the same page group into one `listings` entry ordered by `position`; a `full-spread` slot is ONE entry (`span: 2`, at its left page) and its second page produces no entry; `toSpreads` returns `[1]`, `[2,3]`, `[4,5]`... by even left page, a spread entry sits alone on the spread of its left page, and a trailing odd page stands alone; `regionOfPage` finds the block containing a page, null otherwise; `spreadIndexOfPage` finds a page inside a spread entry (including the right side of a full spread).
- [ ] **Step 2: Run** `pnpm --filter @vardenia/core test magazine-view` - expect FAIL (module missing).
- [ ] **Step 3: Implement** the functions above. Page numbers come only from the slots and `pageCount`; no layout names are hard-coded beyond `full-spread` (use `LAYOUT_SHAPE` for the span).
- [ ] **Step 4: Run** the same command - expect PASS; then core typecheck/lint.

### Task 2: Data route `GET /place-submissions/magazine`

**Files:**

- Create: `apps/web/src/lib/magazine-view.ts`, `apps/web/src/lib/magazine-view.test.ts`, `apps/web/src/app/place-submissions/magazine/route.ts`, `apps/web/src/app/place-submissions/magazine/route.test.ts`
- Modify: `apps/web/src/proxy.test.ts` (add `['/place-submissions/magazine', 'JSON: the magazine viewer']` to the same list as `/place-submissions/issues`)

**Interfaces:**

- Consumes: Task 1; `toSlots`, `issuePageCount` from `../collections/Issues`; `issueParam` from `../app/place-submissions/issues/params`; `withRateLimit`; `reportError`; `plain-text.ts` for the description.
- Produces:

```ts
export interface MagazineBusiness {
  number: number
  name: string
  tagline: string
  category: string
  governorate: string
  address: string
  hours: string
  phone: string
  description: string
  photoUrl: string | null // media size `card`, null when none
}
export interface MagazineData {
  issue: { id: number; title: string }
  pages: MagazinePage[]
  regions: MagazineRegion[]
  businesses: MagazineBusiness[]
}
export async function loadMagazine(
  payload: Payload,
  issueId: number,
  locale: string | undefined,
): Promise<MagazineData | { problem: 'not-found' | 'no-slots' }>
```

Route: `GET ?issue=<id>&locale=<code>` -> `{ ok: true, ...MagazineData }`; 400 for a bad id, 404 `not-found`, 409 `no-slots`; `cache-control: no-store`, `dynamic = 'force-dynamic'`, rate limited, same shape as `app/place-submissions/issues/route.ts`.

- [ ] **Step 1: Failing tests** (lib, with a fake payload as the neighbouring tests do): only the five visible statuses are returned; `isSample` and the other statuses are excluded; the business object's keys are exactly the whitelist above (no `submission`, no email, no `id`); `pages` for a two-page template with one editorial page carries the template note; regions come from the issue's `listing-ranges` (`governorate`, `firstPage`, `lastPage`); unknown issue -> `not-found`; issue without slots -> `no-slots`. Route tests: bad `issue` -> 400, `no-store` header, 429 behaviour is whatever `withRateLimit` already does (follow `issues/route.test.ts`).
- [ ] **Step 2: Run** the two test files - expect FAIL.
- [ ] **Step 3: Implement** `loadMagazine`: read the issue with `overrideAccess: true` (slots, pageCount, template, title in `locale`); template notes from its `pages` (note per page number, built by walking `TEMPLATE_PAGE_SHAPE`); businesses with `issue` = id, `listingNumber` set, `isSample` not true, `submission.status` in the visible set, `depth: 1`, localized by `locale`, limit generously with `pagination: false`; map to `MagazineBusiness` explicitly field by field (never spread).
- [ ] **Step 4: Run** tests - expect PASS. Then add the route and the proxy test line.
- [ ] **Step 5: Photo rule (my call, replaces the spec's "approved photos only")**: there is no automatic photo moderation in the repo, so show the hero photo of every visible (submitted) business; staff review photos at submission review and a `rejected` business drops out of the view. Record this in the task report. Do not invent a moderation field.

### Task 3: Restore the description in the form and previews

**Files:** exactly the description hunks removed by commit `c0ae045f`: `components/places/PlaceSubmissionForm.tsx`, `form-model.ts`, `preview-model.ts`, `PageTemplateA.tsx`, `PageTemplateB.tsx`, `PageTemplateC.tsx`, their tests, `lib/place-flow-i18n.test.ts`, and `form.description` / `form.descriptionHint` in all 10 locale files.

**Interfaces:** Produces `PreviewData.description: string` and the form textarea (optional, max 2000, same as the server schema which already accepts it).

- [ ] **Step 1:** `git show c0ae045f -- <those files>` and reverse only the description-related hunks (keep every issue-first change). Template B's photo goes back beside the text as it was before; the page-fit budget in `preview-model.ts` goes back to include the description.
- [ ] **Step 2:** Remove `form.description` and `form.descriptionHint` from `REMOVED` in `place-flow-i18n.test.ts`; restore the keys in all locales (Arabic translated as before, the rest as they were).
- [ ] **Step 3:** Run the form, preview, preview-model, i18n parity tests, then all gates. Expected: PASS, with the A/B/C page-fit tests passing at the worst input.

### Task 4: Page cards (presentation)

**Files:**

- Create: `apps/web/src/components/magazine/MagazinePageView.tsx`, `ListingCard.tsx`, `EditorialPage.tsx`, `magazine-labels.ts`, plus `*.test.tsx`

**Interfaces:**

- Consumes: `MagazinePage`, `MagazineBusiness` (import the types from `@vardenia/core/magazine-view` and a small shared type file in `apps/web/src/components/magazine/types.ts` mirroring `MagazineBusiness`; the route's lib re-exports that same type so there is one definition).
- Produces:

```tsx
export function MagazinePageView(props: {
  page: MagazinePage
  businesses: Map<number, MagazineBusiness>
  regionName: string | null
  highlight: number | null
  labels: MagazineLabels
  dir: 'ltr' | 'rtl'
}): JSX.Element
```

One page is drawn in a container with `container-type: inline-size`, sized in `cqw`, ratio `PAGE_RATIO` (reuse from `components/places/preview-model`). Layout geometry like the PDF: full page = photo about 60% top, text below; half page = two stacked cards; 1/3 = three; 1/4 = 2x2; full spread = one card across two page widths. Card: category (small caps), name, description (clamped), contact line (address, phone, hours), photo. A free number draws a grey box with `Listing N` and the layout's label. Footer on listing pages: `VARDENIA.COM | <page> | <REGION>`. Editorial page: calm neutral page showing the note (or the page number) only. `highlight` outlines the card and shows "You".

- [ ] **Step 1: Failing tests:** each of the five layouts renders the right number of cards at the right positions (assert by `data-number`); a free number shows "Listing N"; a business shows its name; no photo/description renders the placeholder without throwing; a 60-char name and a 2000-char description are clamped (assert the clamp style); highlight marks only that number; footer shows page and region; editorial shows its note.
- [ ] **Step 2:** Run - FAIL. **Step 3:** Implement. **Step 4:** Run - PASS, plus gates.

### Task 5: Viewer, data hook and page route

**Files:**

- Create: `apps/web/src/components/magazine/MagazineViewer.tsx`, `use-magazine.ts`, tests; `apps/web/src/app/(frontend)/[locale]/magazine-places/view/page.tsx`

**Interfaces:**

- Consumes: Task 2 route, Task 4 `MagazinePageView`, Task 1 `toSpreads`/`regionOfPage`/`spreadIndexOfPage`, `use-fresh-json.ts` for reference.
- Produces:

```ts
export function useMagazine(
  issueId: number | null,
  locale: string,
  intervalMs?: number,
): { data: MagazineData | null; error: boolean; loading: boolean }
export function MagazineViewer(props: {
  issueId: number
  locale: Locale
  highlight: number | null
}): JSX.Element
```

Behaviour: spread view (two pages side by side from `sm` up, one page below, RTL flips the order); previous/next, keyboard arrows, a page-number jump, a region jump menu (from `regions`); opens at the spread of `highlight`'s page when present, else spread 0; only the current spread (and the next, lazily) renders. `useMagazine` refetches every 30 s (default `intervalMs = 30_000`) and on tab focus; no overlap (skip while a request is pending); pauses while `document.hidden`; aborts on unmount; a failed poll keeps the last data and sets `error` only when nothing is loaded. Page route: noindex like its sibling, reads `issue` and `number` search params with the same digit rules as `issueParam`, renders a clear "choose an issue" state for a bad id, otherwise the viewer.

- [ ] **Step 1: Failing tests** (fake timers + mocked fetch): first load shows the first spread; the interval triggers a refetch and a newly reserved business appears; no second request while one is pending; no polling when hidden; failure after success keeps the old view; unmount aborts; arrows/keyboard change spread and RTL reverses sides; region jump goes to the region's first page; `highlight` opens on its page and a bad `number` falls back to spread 0; error state when nothing loads.
- [ ] **Step 2:** Run - FAIL. **Step 3:** Implement. **Step 4:** Run - PASS, plus gates.

### Task 6: Strings, the form link, and final checks

**Files:** `packages/i18n/src/messages/*.json` (new `magazineViewer` block: title, prev, next, page, region, jump, you, freeListing, error, retry, chooseIssue, empty), `components/places/PlaceSubmissionForm.tsx` + its test (one link), `lib/place-flow-i18n.test.ts` / parity tests as needed.

**Interfaces:** Consumes Task 5's route: link `href=/{locale}/magazine-places/view?issue={issueId}` (add `&number=` when the owner holds one), `target="_blank" rel="noopener"`, shown only after an issue is chosen.

- [ ] **Step 1:** Add the keys to all 10 locales (Arabic translated). **Step 2:** Add the link and a test that it appears only with an issue and carries the right URL. **Step 3:** Run all gates and report the full numbers; write `.superpowers/sdd/2026-11-26-layouts-pricing/magazine-viewer-report.md` with what was built, the photo rule, and what is not browser-verified.

## Self-review notes

- Spec coverage: viewer from slots (T1,T2,T4,T5); businesses visible after submit (T2 whitelist+status); placeholders for editorial (T4); polling/focus (T5); description back (T3); one link (T6); privacy and performance (T2,T5).
- The spec put the page at `/[locale]/places/magazine`; the real family is `/[locale]/magazine-places/`, so the viewer lives at `magazine-places/view` (a naming call).
- The spec's "approved photos only" is replaced by T2 step 5 (no moderation field exists).
