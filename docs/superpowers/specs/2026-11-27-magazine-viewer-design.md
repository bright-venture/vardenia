# Magazine viewer (preview the issue with real businesses) - design

Date: 27 November 2026. Status: draft, waiting for approval.

## Intent and why

A business owner who reserves a place in a magazine wants to see **where his
page sits in the issue and how it will look next to the others**. The designer
delivers each issue as a PDF (200 pages for All Lebanon: cover, editorial
pages, region separators, then listing pages with grey boxes labelled
"Listing 51", "Description", "Call to action"). The goal is a viewer that looks
like that PDF, where each box is filled with the real business that holds that
listing number. It is saved, not per-visitor: once a business reserves its
place, every other owner who opens the viewer sees it.

## Goals

- A read-only flipbook of one issue, page by page (two pages side by side on a
  wide screen, one page on a phone), built from the data the admin already has:
  the issue's slots (page, position, layout) and its governorate blocks.
- Each listing number shows the business that holds it (photo, category, name,
  description, contact line, page footer "VARDENIA.COM | page | REGION"), or a
  grey placeholder "Listing N" when free.
- Works on the template we have today (All Lebanon). The designer's PDF is not
  created in the admin yet; the viewer needs no change when it is.
- Fresh without a reload: the viewer refetches every 30 s while open and when
  the tab regains focus.
- The description comes back in the form (optional) and on the preview/pages.

## Non-goals and anti-goals

- No PDF embedded, no external service (see Approaches).
- No editorial artwork (cover, intros, separators). Those pages show a quiet
  placeholder with the template's own note ("Cover", "Separator"...). Real art
  can be attached later; nothing here blocks it.
- No change to issues, listing ranges, numbers, prices, templates, submission
  rules or the issue-first flow. The viewer only reads.
- Not editable from the viewer. No print/PDF export.
- Failure even if it "works": loading all 200 pages' images at once, or showing
  any private data (owner e-mail, the verified phone, payment or status data).

## Constraints

- Payload read access: the issue's `slots` and `template` are staff-only, so
  the viewer's data comes from one purpose-built, rate-limited, uncached route
  (like `/place-submissions/issues`) that reads with the server's access and
  returns only what the page needs.
- Client code imports only narrow `@vardenia/core` modules (`page-layouts`).
- All 10 locales get the new strings; RTL (Arabic, Urdu) must flip the book.
- A held number comes from `businesses.issue` + `listingNumber`.

## Approaches considered

1. **Draw it from the template data (chosen).** Pages computed from slots,
   boxes filled with businesses. Trade-off: the layouts are re-drawn in code,
   so they follow the PDF's look, not its exact pixels.
2. **Embed the PDF.** Exact look, but the blank boxes can't be filled per
   business, so the owner never sees his own page; 12.6 MB per load. Rejected.
3. **Button to an outside service showing the PDF.** Owner leaves the site and
   still sees only blank boxes. Rejected.

## Design (decisions)

**Route.** New page `/[locale]/places/magazine?issue=<id>` (separate from the
form). Optional `&number=<n>` jumps to that listing and marks it "You".

**Data.** `GET /place-submissions/magazine?issue=<id>` returns:

- `pages`: for every page 1..pageCount, either `{ page, kind: 'editorial',
note }` (a page with no slot; note from the locked template, null if none) or
  `{ page, layout, slots: [{ number, position }] }` (a spread is one entry
  spanning two pages);
- `regions`: governorate blocks (first/last page) for the footer and a jump menu;
- `businesses`: for held numbers only, the fields the printed page shows: name,
  tagline, category, governorate, address, hours, phone, description, hero
  photo URL (small size), listing number.
- A business counts as held when it has the number in that issue, i.e. once the
  owner has submitted and reserved. Never e-mail, owner id, verified phone or
  status fields.

**Layouts to draw** (one slot card, sized by layout, like the PDF): full page
(photo about 60% on top, text below), half page, 1/3, 1/4 (2x2 grid), full
spread (one card across both pages). Header/footer text per page as the PDF.
Free numbers draw the PDF's grey "Listing N" box.

**Performance.** One light JSON for the structure; only the visible spread
(plus the next one) renders; photos are lazy and use the small media size.

**Form.** The description textarea returns (optional, same limit as before,
restored from the commit before `c0ae045f`) and the description slot returns on
the three preview templates, with its i18n keys. One link "See the magazine"
(opens the viewer in a new tab, after an issue is chosen) is the only other
form change; no form logic changes.

## Left to the builder

Page-turn animation, exact spacing, the placeholder look of editorial pages,
skeleton/error/empty states, the jump menu UI, tests, i18n wording.

## My calls (please check)

- Refresh by polling every 30 s, not websockets: simple, and "next minute" is
  fresh enough for reservations.
- Photos are shown only when the photo is already approved by the existing
  moderation check, otherwise the grey box, so an unmoderated image never shows
  to strangers. (Builder to confirm the field and wire it.)
- Built generic over any issue's slots, but delivered and tested on All Lebanon;
  the governorate PDF needs no code change once its template exists.
- Editorial pages are placeholders, not artwork.
