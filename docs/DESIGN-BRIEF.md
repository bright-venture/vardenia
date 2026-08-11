# Vardenia - Design brief

## What it is

A premium tourism and lifestyle platform for Lebanon: a printed magazine twice a year, a
website, and later a mobile app. Readers move between them by scanning QR codes printed in
the magazine and on stickers in venues.

Audience: affluent domestic readers, Gulf and European visitors, and the Lebanese diaspora.
The tone is a luxury travel title, not a listings site.

## Screens, in priority order

1. **Listing page.** A single hotel or restaurant. Photos, description, opening hours, and
   the actions: call, directions, reserve. **Design this first and design it for a phone.**
   Every printed QR code lands here, usually opened by someone standing in a lobby.
2. **Directory.** Browsable, filterable list of places.
3. **Homepage.**
4. **Article page.** Long-form editorial, shared with the print edition.
5. **Scan fallback.** What a reader sees when a printed code no longer resolves. Rare, but
   it is the brand's apology, so it should not look like an error page.

## Non-negotiables

**Arabic, right to left.** English and Arabic are equal, not a translation layer. Design at
least the listing page and directory in Arabic as well. Please specify the Arabic typeface
explicitly: most Latin display faces contain no Arabic characters, and substituting one
mid-headline looks broken.

**Mobile first.** Desktop matters less here than for most sites.

**Long names must fit.** Test with real content, for example "Le Royal Hotels and Resorts
Beirut", not lorem ipsum. Arabic often runs longer than English for the same phrase.

## Deliverables

**A token set, not per-screen values.** Named and reusable:

- Colour: a small palette with steps, for example `ink-100` through `ink-900`, one accent,
  plus success / warning / error
- Type: a scale with sizes, weights and line heights, for both Latin and Arabic
- Spacing: one scale, ideally on a 4px grid
- Corner radius, shadows, and any motion timings

The codebase already stores design this way, in a single tokens file. A set of 40 screens
each carrying its own hex codes cannot be wired up the same way, and a future rebrand stops
being a one-file change.

**States, not only the happy path.** For every interactive element: default, hover,
keyboard focus, disabled. For every list or page: empty, loading, error. This is roughly
half the real work and is the thing most often missing.

**Accessible contrast.** Body text should meet WCAG AA, 4.5:1. Pale grey on white photographs
well and fails in sunlight, which is where this will actually be read.

## Typeface licensing

Confirm before choosing. A licence for print does not automatically permit web embedding,
and web licences are often priced by monthly pageviews. Both the Latin and Arabic faces need
web licences.

## Handoff format

Any one of these:

- A **Figma Dev Mode** link (best)
- Screenshots of each screen, plus the token values written out as text
- Logos and icons exported as **SVG**, not PNG

Photography direction is welcome as a separate note: the platform is image-led and the
photo standard will matter more than any other single visual decision.

## Questions to raise early

Anything that affects structure rather than surface. If a screen needs a field the CMS does
not have, or a listing should show something not currently collected, flag it now. Adding a
field is cheap today and gets more expensive after launch.
