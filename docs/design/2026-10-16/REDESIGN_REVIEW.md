# Vardenia complete frontend design — review package

Completed design pass: **16 October 2026**. Based on bright-venture/vardenia commit
`ea6db40787daa5a40b59ff53d79df5a9f7194ac6` downloaded on 15 October.

This package adapts the existing Next.js/Payload application. It is a local review
and deployment-preparation deliverable. GitHub, the live website, production
content, accounts and bookings have not been modified.

## Cinematic photographs and automatic city slider

The six-city feature now advances automatically every six seconds while at least
35% visible. It waits a full interval after selection, pauses on interactive-control
hover and keyboard focus, and stops while offscreen, in hidden tabs or with motion
disabled. A localized pause/play control makes the automatic rotation optional.
Manual selectors and previous/next controls remain available with motion off.

| Before                                              | After                                                                 | Why                                                             |
| --------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------- |
| Manual city changes only                            | Visible six-second rotation with explicit pause/play                  | Apply the requested automatic slideshow                         |
| Bright photography with varied colour               | Shared photographic film grade across public pages and recovery views | Match cool navy shadows with warmer stone and restrained colour |
| Global image edits would affect functional graphics | Photo-specific selectors and explicit listing/gallery markers         | Retain QR scanning and accurate covers, logos and map tones     |

This is a website display grade rather than a replacement photo library: the original
six approved Lebanese images and film remain. No images were sent to an external
editing service, regenerated or overwritten. Source attributions and adaptation
notes remain in the homepage credits and ASSET_CREDITS.md.

Latest checks: web type check, production compile-mode build, and seven focused
scheduler/map/route tests passed. Browser inspection confirmed automatic city
progression, persistent pause, photo treatment on the homepage/menu, directory,
listing and About views, and a static/manual 390px motion-off layout. The new
shared grade, scheduler and styles passed source design lint with zero failures
or warnings. Existing six native-image lint advisories remain; no new ESLint
errors. The full site suite was not rerun for this presentation follow-up.

## Current homepage changes — section and map review

This pass supersedes the category, ordinary directory, verification, article and
business section placements described in the earlier finishing-pass history below.

| Before                                        | After                                                                                   | Why                                                                                      |
| --------------------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Separate “Find your Lebanon” homepage section | Discover photo menu and mobile category navigation                                      | Keep category browsing available on every page                                           |
| One Baalbek feature                           | Six-city photographic slider, starting with Baalbek                                     | Explore different cities with direct selectors and previous/next controls                |
| Repeated “Places to begin” selection          | Removed; real contracted featured placements remain conditional                         | The reviewed block repeated the same locations/photos; the directory remains in Discover |
| “Behind the mark” on homepage                 | Removed from the homepage                                                               | Apply the requested section removal                                                      |
| Article and business blocks at the end        | Articles under Magazine; business listing invitation under About and in the mobile menu | Keep their real destinations accessible without repeating homepage chapters              |
| Relief stretched into an arbitrary frame      | Source geographic bounds registered to the outline and markers                          | Fix all three map instances together                                                     |
| Small pins disabled by interest filters       | 44px targets, hover/focus names, selection clears incompatible filters                  | Make each city selectable; clicking the map surface also selects its closest city        |

No automatic slider advance was added. Pointer transitions crossfade photographs;
keyboard activation and motion-off preferences show the selected city immediately.
The source raster's published geographic limits were checked against its Wikimedia
source page, and two regression tests compare the original Natural Earth geometry
with the vector outline and register each city's raster/vector coordinates.

Latest checks: web type check and production compile-mode build passed; four
focused map-registration/browser-route tests passed. Targeted ESLint had zero errors
and six plain-image advisories in the existing cinematic component, whose imagery
uses native responsive sources. New menu/map source and homepage style lint had
zero failures/warnings (floating-menu shadow and marker contrast-ring exceptions
are documented). The standalone browser inspector was not run.

Browser verification includes all six map pins, map-surface selection, selecting a
heritage city after a coast filter, city slider selection, article menu navigation,
and requested section absence. Desktop/tablet/390px phone and Arabic layouts were
inspected. Production, GitHub, account data and bookings remain untouched.

## Requested statement section and original animation

The navy “A guide you can hold. A code you can trust.” section now sits before the
QR chapter. The live vardenia.com section was inspected with real upward/downward
scroll input: a pinned 160svh track, sequential word opacity and 40px rises, a small
settle, and the gold accent held until the final 82–98% of progress. The local
implementation reuses that timing and reverses with upward scrolling.

The heading is one semantic heading. Server/no-script rendering, system reduced
motion and the shared footer motion-off preference show the complete sentence with
its gold accent. Supporting text describes the printed guide, online directory,
QR links and the Verified mark; it does not claim every imported listing was visited.

Verified locally: partial and complete reveal, reverse scrolling, motion-off with all
words visible, and English/Arabic layouts at an actual 390px CSS width. Type check,
targeted ESLint and production compile-mode build passed. New section/source lint
reported 0 failures / 0 warnings. Browser screenshots used the permitted CUA controls;
the standalone skill inspector was not run. No new imagery was introduced.

## Homepage finishing pass — 16 October

The initial integration left several homepage chapters incomplete. This revision
finishes that presentation in the local working application:

- Six real category links with keyboard/pointer photo previews and accurate place captions.
- All six turning postcards retained in a compact horizontal collection with native
  swipe/keyboard scrolling and previous/next controls, replacing the long repeated grid.
- A concise three-place editorial directory selection. Every contracted featured
  placement is retained in its own scrolling band, with the original sponsorship note;
  featured listings are excluded from the ordinary selection to avoid repetition.
- A real server-generated QR symbol. When a published photographed listing has a
  printed code, it uses the existing permanent `/g/` URL. Otherwise it clearly offers
  the magazine as an example. The QR uses the configured public site URL (the magazine
  fallback uses vardenia.com when unset); preview links open the local equivalent.
- A scroll-linked paper-card/phone sequence and scan line, with un-pinned phone/tablet
  layouts and static motion-off/keyboard fallbacks. Scrolling does not navigate or book anything.
- The original verification explanation restored, showing the actual Verified mark
  and expandable explanations. Verification is never inferred from a paid tier.
- A complete magazine cover fitted without cropping, with the issue title outside
  the cover. When no issue/cover is published, a clearly typographic magazine treatment
  replaces the previous photographic stand-in; no issue number or publication claim is invented.
- An article composition that fills the available width with one article and expands
  when more are available, plus a photographed business invitation with the existing copy.
- The repeated About closing section removed. Its link now lives with the business
  invitation; the shared footer is the final close.

Latest validation: web type check and compile-mode build passed; **64 focused QR,
media and browser-state tests passed**. The earlier full run of 2,078 tests remains
recorded below and was not repeated for this presentation-only follow-up. New
homepage source lint: 0 failures / 0 warnings. ESLint: 0 errors, with the existing
plain-image advisories in the cinematic journey retained.

Browser checks included desktop (1440px), tablet (768px), phone (390px), Arabic RTL,
heading wrapping, image loading, native postcard scrolling/turning, keyboard category
preview/navigation, verification disclosures, magazine-example navigation and the
scroll-linked QR progression. No horizontal overflow was found in the measured
pages. Live printed-code resolution with real CMS data and the no-content CMS state
still need staging verification; they were inspected in source rather than seeded
into production. All 26 new homepage message keys exist in all ten locale catalogs.

## Before / After

| Area                         | Before                                   | After                                                                                                                                                            |
| ---------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Homepage                     | Existing directory-led homepage          | Approved film, connected scroll journey, pin beneath photographs, photographed paper, geographic coordinates, interactive map, postcards and browser-local route |
| Category pages               | Heading above directory controls         | Individual photographic openings, accurate place captions, useful category choices and redesigned date/filter controls                                           |
| Directory / business details | Existing platform presentation           | Editorial introduction, photographic listing header, actual CMS coordinates, responsive cards and refined booking panel                                          |
| Magazine                     | Shared styling on the original templates | Designed archive and article collections, large issue presentation, readable article layout and existing CMS/PDF links retained                                  |
| About                        | Plain document                           | Immersive Lebanon photograph, paper transition, section index and illustrated brand story                                                                        |
| Contact / business pages     | Plain documents                          | Photographic introductions, clear section navigation and distinct content treatments, preserving existing copy and draft notices                                 |
| FAQ                          | All answers stacked                      | Native expandable answers, direct section links and keyboard access                                                                                              |
| Customer screens             | Original account presentation            | Navy account masthead, booking status cards, saved places, passport, larger mobile form fields and consistent authentication/task screens                        |
| Partner screens              | Original dashboard presentation          | Matching masthead, navigation tabs, booking/filter presentation, listing tools, scan/statement views and sign-in doorway                                         |
| Recovery / legal             | Separate visual styles                   | Matching localized nested 404, independent global recovery pages, readable legal layout and unchanged draft/legal wording                                        |
| Accessibility / motion       | Existing native controls                 | Skip link, focus visibility, mobile menu dismissal, useful touch targets, site-wide motion toggle, reduced-motion guards and restrained image/reveal motion      |

## Preserved functionality

Production data queries, ownership checks and form actions remain in the existing
modules. No samples were inserted into production data or production query code.
The following are byte-identical to the downloaded base:

- API routes, Payload admin routes, collections and hooks;
- permanent QR routing and all files in `apps/web/src/lib` (authentication,
  booking, saved places, search, reviews, availability and related services);
- application dependencies, lockfile and production Next configuration;
- native mobile application source.

No database migration or dependency update is introduced. Shared design tokens
retain their existing keys, but use the approved navy/gold/paper values. The native
app also consumes these shared colours, so a future native build inherits them.

The editorial discovery route is a browser-local selection, separate from account
saved businesses. It is not a driving route or a reservation.

The hero has no Lebanon map. The scrolling location pin remains behind photographs.
The supplied film, approved photos, terrain and photographed paper assets remain
credited through the homepage and footer. See `ASSET_CREDITS.md`.

## Verification

- Web type check passed.
- Full web unit suite: **110 suites / 2,078 tests passed**.
- Production **compile-mode** build passed across the existing frontend, CMS and
  API route graph. A full database-backed production generation was not run.
- Targeted ESLint on this pass: **0 errors / 1 advisory** for the plain local image
  in the independent recovery screen. It intentionally works without image optimization.
- Design-source lint on new editorial components/styles: **0 failures / 0 warnings**.
- Browser review at desktop, 768px tablet and 390px phone widths, with English and
  Arabic representative layouts. Checked pages included category, directory,
  listing/booking, magazine/article/issue, About, FAQ, contact/business, customer,
  saved, passport and partner views. No horizontal overflow was found in the
  measured mobile pages.
- Interactions checked: category and region filtering, native filter sheet,
  article navigation, FAQ expansion, mobile language navigation, menu dismissal
  after navigation and Escape, keyboard skip link, and motion-off persistence
  across page navigation. Previous homepage discovery-route and film checks remain valid.
- Sample booking controls and disconnected failure feedback were reviewed. No real
  account change, booking, cancellation, review, email or financial action was executed.

These checks do not establish live service health. Real content, authentication,
bookings, mail, QR destinations and production performance require staging checks.
Token verification/reset branches and real PDF delivery require valid data/services.

## Review locally

The running review opens at **http://127.0.0.1:8765/design-review** with links to the
individual page designs. The review shell renders the actual website components
against labelled sample listings, an unpublished sample edition, sample account
bookings and empty partner reports. The sample cover is a Baalbek photograph,
not an actual published magazine cover. No PDF is supplied for that sample.

Forms are disconnected; local write handlers return a refusal. The review shell
uses no production credentials or session cookies. `review/` is outside the
production workspace/build and must not be deployed as the real application.

To restart after installing the repository's pinned dependencies:

```sh
pnpm install --frozen-lockfile
node review/run.mjs
```

The launcher recreates local dependency/public symlinks. Dependencies, symlinks,
build caches and generated types are omitted from the archive.

## Remaining content and release requirements

The user confirmed that the official company details are not ready. Existing
unsettled company, founder/team, contact, pricing and legal clauses remain clearly
marked; none was invented or silently removed. These need factual review before
publication. Real listings, covers, articles and PDFs still come from the existing CMS.

Use the existing deployment environment and its standard build process. Generate
Payload types as usual in a clean checkout. Merge this work against the current
repository version, then verify connected services in staging.

GitHub remains read-only under the user's instruction, and the last inspected
connection reported no push access. No publishing is included in this delivery.

`REDESIGN_MANIFEST.json` lists exact changed/new production paths and hashes.
`DESIGN_QA.md` records the visual critique and the limits of this review.

## 16 October — discovery themes and physical mockups

The homepage now offers Nature & walks, Village life, Harbour towns and Sunset views in addition to its original four discovery filters. Destinations can belong to several themes. Each filter resets the region selection; choosing a map pin still clears the filter so every pin remains usable. The toolbar and destination content use natural vertical flow below 1050px to accommodate the extra choices.

The paper-to-place chapter uses a photorealistic phone asset with live HTML content and a working destination link over its screen. Hardware, camera and screen are aligned from one source image. At small mobile widths the printed card and phone stack. The actual QR remains the existing generated QR, outside the illustrative mockup.

The magazine chapter now shows an open magazine with paper curvature, binding and page edges, based on pages 6–7 of the supplied Vardenia PDF. It is a generated product illustration, not an exact facsimile or a new published edition. The preview edition remains explicitly labelled as a sample. See `MOCKUP_ASSETS.md` for asset paths and generation briefs.

Removed the standalone Photography & map credits block from the homepage. Attributions remain accessible at `/credits` through the footer, including recovery pages.

Validation: web TypeScript check passed; production compile-mode build passed (full database-backed generation not run); 9 focused tests across discovery themes, city autoplay, map registration and browser route recovery passed. Targeted ESLint: no errors, seven existing native-image advisories. Taste source check: no failures or warnings. Browser checks covered 1890px desktop, 632px and 390px mobile widths, four new filter selections, phone navigation to the magazine, magazine navigation to its sample issue, footer navigation to credits, and Arabic labels/selection. No horizontal overflow, filter/content overlap or clipped phone screen was found at the reviewed widths. Motion-off control remains available and the mockups remain usable with transforms removed.

This remains a local preview; no GitHub or production writes were made.

## 16 October — hero film follow-up

Confirmed the original hero film remains connected in the local homepage, with desktop and mobile MP4 sources. Changed the hero video preload hint from metadata to auto so the browser can fetch the film earlier. Muted looping playback, explicit playback controls, off-screen pausing, fallback photograph and motion preferences are retained. No other homepage layout changed.

## 16 October — automatic cities and the scanning process

Removed the city-name choices, pause/play button and previous/next arrows from the Cities of Lebanon section at the user's explicit selection. The six-city slideshow still advances automatically while visible, pauses offscreen or in a hidden tab, and respects the site's motion setting. Hovering its region link or using keyboard focus pauses city changes while that action is used. The destination map and its controls remain unchanged.

Recreated paper-to-place as a four-phase camera demonstration: aim at the printed QR, align and read it, show a Code found notification, then reveal the linked page inside the real phone mockup. The camera view uses the same QR data as the printed card. The sequence starts when the phone is in view, runs once and offers an explicit replay that recentres the phone. It pauses offscreen and while the tab is hidden. Motion-off visitors see the linked page directly; keyboard focus can skip to that usable page. This is an illustrative process, without requesting camera access or triggering navigation. Navigation still requires the visitor to choose a real link.

The three text steps track the active phase. Camera and replay labels were added in all ten site languages. Desktop, 632px and 390px browser checks included scan replay, the Arabic page, the motion-off fallback and a working final-page link. The city changed automatically with zero control buttons in its section. No horizontal overflow or clipped final phone content was found at the reviewed mobile widths.

Validation: six focused tests passed (three scan lifecycle/replay/visibility/motion cases and three city autoplay cases); TypeScript passed; production compile-mode build passed; targeted ESLint has no errors and six pre-existing native-image advisories. Taste source check passed. Full database-backed generation and production publishing were not performed. GitHub remains untouched.
