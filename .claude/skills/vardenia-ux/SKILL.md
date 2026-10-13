---
name: vardenia-ux
description: Vardenia's own UI/UX rules and review workflow. Use whenever a task changes how the Vardenia website looks, reads, moves or is used - building or editing a page or component, fixing layout, copy, forms, filters, booking, the passport, the directory, listing pages, the home page - and whenever asked to audit, review, polish or "enhance" the UI/UX. Not for backend-only, database or admin-panel (Payload) work.
---

# Vardenia UI/UX

Vardenia is a luxury travel title for Lebanon: a printed magazine, a website, and QR codes that join them. The website should feel like the magazine on a screen, not like a listings site. Generic "modern web app" advice is often wrong here. When this file and a general guideline disagree, this file wins.

## Who is reading, and where

- **On a phone, standing up.** Every printed QR code lands on a listing page, usually opened in a hotel lobby or at a restaurant door. Design for 375px first; desktop matters less.
- **In sunlight.** Pale text that looks elegant on a monitor fails outdoors. Contrast is not negotiable.
- **In English or Arabic, equally.** Arabic is right to left and is not a translation layer. Urdu is also RTL. Ten UI locales exist; `en` and `ar` are hand-translated.
- **Affluent, unhurried, skeptical of ads.** Restraint reads as quality. Fewer, better elements beat more features.

Screen priority (from `docs/DESIGN-BRIEF.md`): 1 listing page, 2 directory, 3 home, 4 article, 5 scan fallback (`/scan/moved`, `/scan/not-found`, the brand's apology, never an error page).

## Hard rules (most are enforced by tests)

**Tokens only.** Every colour, radius, spacing step and breakpoint comes from `packages/tokens/src/index.ts` through Tailwind. Never a hex in a component, never Tailwind's default palette (`red-500`, `gray-200`, `blue-*`): the config extends the default theme, so those classes compile and silently escape a rebrand.

| Token                                | Use                                                           | Never                                                                                   |
| ------------------------------------ | ------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `ink-900` / `ink-950`                | body text, headings                                           |                                                                                         |
| `ink-500`                            | secondary text (the lightest colour allowed for text)         |                                                                                         |
| `ink-300`                            | icons, rules, decorative marks                                | any text (fails AA; `lib/contrast.test.ts` checks it only appears next to an icon size) |
| `ink-100`                            | hairlines, borders                                            |                                                                                         |
| `surface-base` / `raised` / `sunken` | ivory paper grounds                                           | screen white                                                                            |
| `cedar-*`                            | the navy dark ground (the key says cedar, the colour is navy) | a "green" meaning                                                                       |
| `gold-700`                           | the one gold fill (`Button variant="gold"`, masthead)         | `gold-500` as a fill behind text                                                        |
| `gold-300`                           | focus rings, accents                                          |                                                                                         |
| `state-success/warning/danger/info`  | status only ("Open now", errors)                              | decoration                                                                              |

Text must clear 4.5:1 on **every** ground it can land on (base, raised, sunken, and `gold-100` washes), not just the one it was drawn on.

**Square corners.** No `rounded`, `rounded-sm/md/lg/xl`, or per-corner radii on the public site; `lib/radius.test.ts` fails on any. `rounded-full` is allowed only where round is the meaning (status dot, drag handle). A new exception goes in that test's `ALLOWED` list with a reason.

**Right to left by construction.** Use logical utilities: `ms-/me-/ps-/pe-`, `start-/end-`, `text-start/text-end`, `border-s/border-e`. Never `ml-/mr-/pl-/pr-/left-/right-/text-left/text-right` (the codebase currently has zero; keep it that way). Directional icons (arrows, chevrons) need `rtl:-scale-x-100`. Direction comes from `dirFor(locale)` in `@vardenia/i18n`, never a hardcoded check for `'ar'`. Times, phone numbers and reference codes stay left to right inside Arabic text (`dir="ltr"`), or "09:00 - 23:00" renders reversed; see `OpeningHoursTable`.

**Type.** Display: Fraunces, with Amiri for Arabic. Body: Manrope, with Noto Sans Arabic. Mono (IBM Plex Mono) is for reference codes and catalogue numbers, the cue that a listing has a printed twin. Scale: 12/14/16/18/22/28/36/48/64. Body text never below 14px. Note that `INPUT` in `formStyles.ts` is `text-sm` (14px), which makes iOS Safari zoom the page on focus; changing it is a deliberate design decision, so raise it rather than slipping it into another change.

**Spacing** on the 4px grid (`spacing` tokens). **Motion** from `motion` tokens: 150 / 250 / 400ms, 700ms only for editorial reveals; every animation has a `motion-reduce:` fallback.

**Controls.**

- Use the kit first: `components/ui` (`Button`, `ButtonLink`, `Plate`, `Band`, `Eyebrow`, `EmptyState`, `Rule`, `Prose`, `Stars`, `Tier`). Do not write a fifth version of a card.
- `Button variant="solid"` (navy) is the one thing a screen asks the reader to do: one per screen. `outline` is the alternative, `ghost` the control that must exist but not compete.
- Anything that navigates is a `ButtonLink` or the locale-aware `Link` from `i18n/routing`, never a `<button>` that pushes a route and never a raw `<a>` (it drops the `/ar` prefix).
- Tap targets are at least 44px (`Button size="md"`). `sm` is for dense desktop rows only.
- Form fields use the strings in `components/formStyles.ts` (`INPUT`, `INPUT_ERROR`, `INPUT_ICON`). An error is always a message tied by `aria-describedby`, never colour alone.
- Every interactive element has visible hover, keyboard focus (gold ring) and disabled states.
- Icons are `lucide-react`, never emoji. An icon-only button has an `aria-label`.

**Copy.**

- No hardcoded user-facing strings: add keys to `packages/i18n/src/messages/en.json` and `ar.json`, and to the other eight so no locale shows a raw key.
- Short and concrete. Say what happens ("Request a table"), not system words ("Submit", "Check availability online").
- A bookable place and an advertisement-only place must read differently. Never offer booking where `isBookableSubcategory` / `canTakeBookings` say no.
- **No prices anywhere on the website.** Tier and fee prices live only in the PDFs.
- Test with real long names: "Le Royal Hotels and Resorts Beirut", and the Arabic, which usually runs longer.

**States.** Every list or page has empty, loading (see `PageSkeleton`) and error states, and every form a success state. This is half the work and the part most often missing.

**Performance is UX here.** Readers arrive on mobile data from a QR scan. Use `next/image` with the configured qualities (60, 70, 75) and real `sizes`. Keep pages server-rendered (the kit is server-only on purpose); add `'use client'` only to the leaf that needs it. Reserve space for images so nothing jumps.

## Workflow

1. **Read before changing.** Open the component, its test, and the tokens it uses. Most files explain their own decisions in comments; respect them unless the task is to overturn one.
2. **Look things up when it helps.** If the `ui-ux-pro-max` skill is installed, use focused searches as a second opinion, for example `"form error inline" --domain ux` or `"image sizes" --stack nextjs`. Never take its palettes, fonts or "design system" output: Vardenia's brand is fixed in `packages/tokens`.
3. **Change the smallest thing that fixes it.** Prefer moving to an existing token, kit component or message key over inventing a new one.
4. **Verify in the browser.** Start the `web` preview (`.claude/launch.json`) and check:
   - 375px width first, then desktop
   - the same page under `/ar` (layout mirrored, Arabic fonts, nothing clipped)
   - keyboard: Tab through it, focus always visible, order matches reading order
   - empty, loading, error and long-name cases
   - no console errors
5. **Run the guards.** From `apps/web`: `pnpm vitest run src/lib/radius.test.ts src/lib/contrast.test.ts`, then `pnpm typecheck` and `pnpm lint`. Run the component's own test if it has one.
6. **Show proof.** A screenshot of the result at phone width, plus the Arabic one when layout changed.

## When asked to audit or "enhance" the UI/UX

Walk the screens in priority order at 375px, in English and Arabic. Report findings ranked by impact on a real reader, each with:

- **Where:** the page and the `file:line` that causes it
- **What a reader experiences:** one plain sentence, no jargon
- **Fix:** the specific change, in Vardenia's tokens and kit
- **Size:** quick (minutes), medium, or a design decision for the user

Lead with what blocks or confuses (can't tap, can't read, can't book, lost in Arabic), then friction, then polish. Separate "broken" from "taste". Do not propose a rebrand, new fonts, rounded corners, a dark mode, or new dependencies unless asked; raise them as questions instead. Ask before changes that alter structure (new fields, new pages, new flows), since those touch the CMS and the print product.

## Out of scope

Payload's admin panel (`app/(payload)`, `components/admin`) and the printed QR sheet (`app/qr`) follow their own styling and are excluded from these rules.
