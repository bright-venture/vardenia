# Visual review notes — 16 October 2026

Direction retained: **The place carries it**, seed **892403502**, from the approved
homepage. No new direction draw or rebrand was introduced for this integration.
Playfair Display / DM Sans, Arabic script faces, navy, gold and warm paper remain.

Idea: On this site, Lebanon's passage from coast to mountain becomes a scrollable
journal, and each inner page becomes a useful destination within that journey.
Live interaction: destination selection and a browser-local route on the homepage;
real directory filtering, article reading, native FAQ disclosures and existing
account/booking controls on the inner pages.

## Round 1

Seen in one second: an immersive Lebanese landscape and a large editorial title.
Layout words: About=immersive / story=indexed reading / FAQ=disclosures /
category=photograph-and-choice / archive=editorial grid / account=task interface.

| Before                                    | After                                                       | Why                                             |
| ----------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------- |
| Inner pages only inherited global styling | Dedicated category, story, editorial and account treatments | Make the journey continue beyond the homepage   |
| Mobile menu stayed open after navigation  | Dismiss after a link, outside tap or Escape                 | Keep the destination page available immediately |
| Long FAQ answers filled the page          | Native expandable answers and a section index               | Improve orientation and keyboard access         |

## Round 2

Seen in one second: the place, then the page's purpose and action.
The original imagery, the useful controls and complete existing text remain readable
with motion disabled. Tablet and phone compositions were inspected separately.

| Before                                            | After                                                       | Why                                             |
| ------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------- |
| Rough mask sizing on the new About transition     | Same photographed-paper mask treatment as the approved hero | Preserve the material quality                   |
| Small uppercase form labels and undersized fields | Readable labels and 16px mobile fields                      | Improve touch and reading comfort               |
| Global reveal observer also saw homepage targets  | Homepage retains its own motion controller                  | Prevent two animation systems competing         |
| Default recovery screens                          | Designed localized and independent recovery views           | Offer a clear continuation after a missing page |

Internal rubric scores, deliberately provisional: design 6.5, usability 8.0,
creativity 7.0, content 5.0; weighted overall **6.9/10**. These are an internal
critique, not an external award or accessibility certification. The design score
is capped because some editorial inner pages use fewer than four contextual
photographs; content is capped by labelled samples and unsettled company details.
Task screens are assessed as functional interfaces rather than landing pages.

Remaining limits: replace review samples with actual CMS content in staging; supply
company/team/contact facts when ready; review legal/pricing draft clauses; test
real authentication, email, booking and PDF flows; measure production performance
on representative devices. No fictitious reviews, published covers or business
statistics were added to make those gaps appear complete.

Source lint passed for new editorial components/styles. Browser screenshots and
DOM measurements were made using the permitted browser controls; the skill's
standalone browser inspector was not run. No automated inspector score is claimed.

## Round 3 — homepage completion

The homepage finishing pass keeps the same direction and seed; there was no redraw.
The idea now carries through useful category choices, real directory slots, print-to-page
QR exploration, verification and the final business invitation.

| Before                                          | After                                                  | Why                                              |
| ----------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------ |
| No category links within the story              | Photo-led six-category selector with working links     | Let readers choose a useful next step            |
| Print/QR and verification chapters absent       | Real QR example and original verification explanations | Restore the product's print/digital relationship |
| Six large vertical postcards                    | Six compact scrollable/turnable postcards              | Retain exploration with less repetition          |
| One article stranded in a three-column grid     | Full-width lead story composition                      | Work at the actual content density               |
| Cover title over the artwork                    | Complete uncropped cover, title and issue link below   | Respect real magazine artwork                    |
| Plain business text and two consecutive endings | Photographed invitation and one footer close           | Give the end a clear purpose                     |

Reviewed screenshots: desktop category, directory selection, QR sequence, magazine,
article and business; 390px English and Arabic categories/QR; 768px QR layout.
The scan line and phone/card transforms were measured before/after native wheel input,
and the motion toggle restores a static layout. The tablet phone/caption spacing was
corrected after the first screenshot. Browser source inspection used permitted CUA;
the skill's standalone inspector was not run.

Updated internal homepage critique: design 7.3, usability 8.0, creativity 7.5,
content 5.0; weighted 7.2/10. Content remains capped by labelled samples and missing
company details, rather than filling gaps with fictitious proof. This is a provisional
internal critique, not an external score. Original six approved place photographs
are reused and credited; the QR is generated in code and the phone shows an actual
page target, without invented booking/account statistics.

## Requested statement follow-up

| Before                                                 | After                                                                 | Why                                              |
| ------------------------------------------------------ | --------------------------------------------------------------------- | ------------------------------------------------ |
| Statement missing from the journey                     | Navy statement before the QR chapter                                  | Restore the selected original section            |
| First draft used a whole-heading entrance              | Original pinned word-by-word timeline, gold word last                 | Match the observed live animation                |
| Original motion helper only followed the OS preference | Shared motion toggle, static server fallback and one semantic heading | Keep the statement readable with motion disabled |

The requested gold emphasis is retained from the user's supplied screenshot. The
live original and local version were compared during real forward/reverse scrolling.
Desktop and 390px English/Arabic layouts were inspected. No new art direction or
photography was introduced; the prior provisional page critique still applies.

## Requested section and map refinement

Direction and seed remain unchanged. The homepage now concentrates on the film,
coast/mountain journey, a six-city photographic slider, interactive destination map,
postcards, promise, print/QR and magazine. Category browsing, articles and the business
invitation have moved into shared navigation. The ordinary repeated place selection
and separate verification section are removed; conditional contracted featured
placements are retained.

| Before                                    | After                                                                   | Why                                                                  |
| ----------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------- |
| One city image in the stone chapter       | Six city selectors plus previous/next controls                          | Follow the user's city-slider direction                              |
| Arbitrary relief frame, separate pin math | Shared geographic projection from the source raster limits              | Keep outline, terrain and pins registered in all three map instances |
| Tiny dots and inactive filtered cities    | 44px hit targets, city names on hover/focus, compatible selection reset | Make the map respond to direct exploration                           |
| Repeated navigation/content sections      | Discover photo menu, Magazine article links, About business link        | Shorten the homepage without losing destinations                     |

Reviewed: desktop city feature and menu; tablet menu at 767px; 390px English city
selector/mobile menu and Arabic map. No horizontal overflow was measured. Coordinates
and city controls do not overlap on phone; Arabic map details sit above the map.
All six pointer-selected pins changed the destination. A heritage pin cleared the
coast filter; the map surface selected its nearest city. Keyboard city activation
has a 0s transition, pointer activation 0.6s, and motion-off remains 0s. Motion was
restored on after checking. Article menu navigation opened the article archive and
closed the mobile menu. All requested homepage removals were checked in the DOM.

Source checks: type check, compile-mode production build and four focused projection/
browser-route tests passed. Source design lint: 0 failures, 0 warnings; the menu
shadow and marker contrast ring are documented exceptions appropriate to overlays
and small controls. ESLint: 0 errors and six existing native-image advisories in the
cinematic component. Browser verification used CUA; no standalone inspector run or
fresh full-suite count is claimed. The previous site-wide score remains provisional;
content gaps and staging checks are unchanged. No new images or reference redraw.

## Cinematic treatment and autoplay follow-up

The approved direction/seed and original assets remain. Photos now share a display
film grade with restrained saturation, cool blacks and warmer highlights. Hero,
scene, city, map-stage, postcard, menu, directory, listing/gallery, article, About,
authentication and standalone recovery photography share the treatment. Film,
printed artwork, functional QR symbols and geographic map pixels keep their own
colour. No new imagery or sample claims were added.

| Before                                   | After                                                                 | Why                                              |
| ---------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------ |
| Manual six-city slider                   | Six-second visible rotation with localized pause/play                 | Make the requested feature automatic             |
| Automatic motion could interrupt reading | Pause on controls/keyboard focus and stop offscreen/hidden/motion-off | Retain manual exploration and accessible reading |
| Inconsistent photo rendering             | One photographic transfer curve across public routes                  | Make imagery feel like one editorial collection  |

Browser observations: unattended city changes, pause remaining on Deir el Qamar,
shared filters on directory/listing/About photos, unfiltered QR/cover, and 390px
manual city selection with motion off, zero transitions and no overflow or control/
coordinate overlap. Scheduler tests exercise timing, manual reset, hidden/offscreen
pauses and disabled cleanup. Source design lint: 0 failures/0 warnings; standalone
inspector not run. Existing provisional score and pre-launch content limits remain.

## Physical mockups and discovery themes — 16 October

| Before                                    | After                                                                 | Why                                                                          |
| ----------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Four broad single-category filters        | Eight localized themes, with destinations in multiple relevant themes | Gives visitors more ways into the existing destination set                   |
| Fixed mobile toolbar/details positions    | Natural grid flow below 1050px                                        | Prevents the expanded controls from covering the destination text            |
| Rounded rectangle standing in for a phone | Photoreal hardware with camera, side buttons and live screen content  | Makes the print-to-digital connection tangible while keeping the link usable |
| Tilted flat photo with blank bands        | Open-magazine product illustration based on an actual Vardenia spread | Shows the printed product with page depth and binding                        |
| Homepage credits accordion                | Separate footer-linked credits page                                   | Keeps the homepage flow focused while preserving source information          |

Reviewed desktop and mobile screenshots; phone controls remain readable and 44px high. On 390px screens the QR card and phone stack; at 632px they sit side by side. Arabic theme labels and the village selection work, with no toolbar/content overlap. Sample issue labelling is preserved. Generated miniature magazine text/QR is illustrative and should not be treated as the exact publication or the functional QR.

## Scan-process follow-up — 16 October

| Before                                                           | After                                                                            | Why                                                                      |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Automatic cities with a row of names and three playback controls | Automatic slideshow with only the region action and coordinates                  | Follows the user's clarified request to remove the controls              |
| Phone immediately showing a finished page                        | Camera frames the matching QR, reads it, confirms detection and reveals the page | Demonstrates how printed discovery becomes digital discovery             |
| Decorative scan line on the printed card                         | Scan line and framing corners inside a camera view                               | Makes the animation correspond to the scanning action                    |
| Scan motion tied to a long scroll section                        | A short visible-phone demonstration with replay                                  | Gives mobile visitors the complete process without a long pinned section |

Keyboard users can skip to the linked page. Motion-off visitors get the final page directly. Replay is deliberate; the animation runs once, never navigates by itself and never asks for camera permission. The actual printed QR and destination links are preserved.
