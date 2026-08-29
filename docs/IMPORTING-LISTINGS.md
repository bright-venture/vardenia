# Importing listings from a spreadsheet

Turns a directory held in Excel into draft listings, each owning a QR code, so a
designer can be handed a sheet of codes.

## Collecting listings from somebody outside the team

Two files do this, and neither of them is an app. The people filling them in are
not on the team and will not be trained; a spreadsheet is a thing they already
know, works offline and can be emailed. What a form would have bought is
validation, and Excel's dropdowns buy most of that where it matters - while they
are typing, rather than in a report afterwards.

**The template.** `python scripts/make-listing-template.py` writes
`vardenia-listing-template.xlsx`: the exact columns `import/listing-row.ts`
reads, a filled example row, help text under every heading, and dropdowns on
Category, District and Usually When. The lists are short because they are the
ones the importer accepts - a category typed by hand that is not on the list
means the row is rejected, so the dropdown is not decoration.

Regenerate it whenever the importer's vocabulary changes. A template that
produces a file the importer cannot read is worse than no template.

**Only Mount Lebanon.** `listing-row.ts` hardcodes the governorate and knows
three district headings. That is a property of the Keserwan import it was
written for, not a decision about the product, and it has to change before a
business anywhere else can be collected this way.

**The photo folders.** Photographs never go in the spreadsheet. Once the sheet
comes back, export the Listings tab as CSV and run:

```bash
pnpm --filter @vardenia/web photos:folders sheet.csv photos
```

That creates one empty folder per business, named exactly as the slug the
importer will mint, each holding a note saying what goes inside. It also writes
`photos/_folders.csv` pairing folder with business, so a later photo import
reads the pairing rather than re-deriving it - a business renamed between the
shoot and the upload then keeps its photographs.

Inside a folder: `cover.jpg` is the hero, and `01.jpg`, `02.jpg` are gallery
images in name order.

### Why folders rather than named files

`chez-sami-2.jpg` cannot be told apart from the cover photo of a business whose
slug is `chez-sami-2`, and four such slugs are already live -
`boneless-28`, `chez-sami-2`, `murray-resto-2`, `zaatar-w-zeit-2`. The importer
mints that suffix whenever two businesses share a name, so it will keep
happening. A folder per business removes the ambiguity, and matches how a shoot
is organised anyway.

### Uploading the photos once they come back

```bash
pnpm --filter @vardenia/web photos:import photos --credit "Studio X" --rights supplied --dry-run
```

Drop `--dry-run` to write. It reads one folder per listing, matches the folder
name against the slug, uploads `cover.*` as the hero and the rest as gallery
images, and reports everything it did not do.

**Credit and rights are required.** Neither can be worked out from a file, and
several hundred photographs of real businesses published on a commercial
directory with no record of where they came from is a liability rather than an
untidiness. `--rights` is `owned`, `licensed` or `supplied`.

**Nothing is guessed.** A folder matching no listing is named in the report, not
fuzzy-matched. A listing that already has a real photograph is left alone -
`--replace` overrides that - because the usual second run is somebody adding the
folders that were missing the first time.

**HEIC is refused, by name.** It is what an iPhone shoots by default and
`Media.ts` does not accept it, so it will arrive. The report says which file and
that it needs exporting as JPEG, rather than "unsupported file", which would
send somebody hunting for a bug.

It is a command rather than a screen for the same reason the listing import is a
screen: a spreadsheet is small enough to post to a function, and gigabytes of
photography is not. The folders arrive on somebody's machine anyway, and that
machine is three times closer to the database than the deployed site is.

### How many photos to ask for

`galleryLimit` is what a tier buys: free shows **1** gallery image, featured 6,
premium 15, partner 40. Every listing is free today, so a folder of twenty
photographs displays two of them - the cover and one - while all twenty are
uploaded, re-encoded into six sizes each and stored where nobody sees them.

Ask for a cover and one or two more until listings are actually sold.

## Doing it in the admin panel

**Import listings (CSV)**, in the sidebar under Reports. That is the way to use
this; the command line below exists for large runs and for teardown.

1. Save your sheet from Excel as **CSV UTF-8**. Not `.xlsx`.
2. Choose the file and give the import a **batch name**.
3. Press **Check the file**. Nothing is written. You get a count, the rows that
   cannot be used, and the rows the spreadsheet gets wrong.
4. Press **Import**. A progress bar counts through the file.

The batch name is not decoration. It is the only thing that lets the whole
import be removed again afterwards, including codes somebody has already
scanned. Give every import its own.

### Why there is a progress bar and not a spinner

A listing is slow to write, and the reason is distance rather than work.
Counted with `pg_stat_statements` against the development database, one listing
costs **31 database round trips** and the server executes them in about two
milliseconds. Everything else is the network: 98% of an import is spent
waiting.

That is why it is so much slower in production. The round trips are the same;
each one is longer. `netlify.toml` records 217ms from the function to Frankfurt
against 62ms from a laptop in Beirut, because the region setting there needs a
Netlify Core Pro plan and is being ignored on the current one.

A Netlify function is killed at ten seconds, so an import cannot run inside one
request. The browser holds the loop instead, because a browser tab has no
timeout, and asks for a window of listings at a time.

**The window sizes itself.** It starts at one, times the round trip, and grows
while windows stay under six seconds, never more than doubling and never past 25. That is not tuning for its own sake: a fixed window of five was the first
version, and at the speed of the day it took 17 seconds - so it worked on a
laptop and would have been killed in production. The client cannot know that
distance in advance, so it measures instead of guessing.

**Three windows run at once.** A window is almost entirely idle, and in
production it shrinks to a listing or two, so a sequential import becomes a
couple of hundred requests waiting one after another. The first window still
runs alone: it establishes how long a listing takes here, how many listings the
file holds, and creates the one placeholder image that three cold lanes would
otherwise each upload a copy of.

A window either finishes or it does not, and one that fails can simply be sent
again: every write is skipped when the slug already exists. That also means it
is safe to close the tab and start again later - re-importing the same file with
the same batch name picks up where it stopped.

If a single listing cannot be written inside the function's limit, the browser
route cannot work at all on that deployment. Use the command line, which runs
from your machine and is not subject to it.

### The QR code is minted before the listing

Backwards on purpose. `ensureQrCode` normally mints a code after a listing is
saved and then saves the listing again to point at it, and on a versioned
collection with three array fields that second save cost about twenty of the
fifty-seven round trips a listing used to take.

So the import creates the code first and hands it to the listing, which means
the expensive save happens once and the link back goes on the code instead -
a record with no versions and no arrays. The hook is untouched and still covers
every other way a listing gets created.

## Doing it from the command line

Faster for a few hundred rows, because there is no per-window round trip.

```bash
pnpm --filter @vardenia/web import:listings listings.csv --batch keserwan-2026-08 --dry-run
```

Then drop `--dry-run` to write. `--limit 5` imports only the first five.

### Which database it writes to

By default, only the one named in `SEED_ALLOWED_DB`. That is the same guard the
seed uses, and it fails closed: unset means refuse.

Production is reachable, because this is eventually meant to run there, but only
by naming the target on the command line:

```bash
pnpm --filter @vardenia/web import:listings listings.csv --batch x --target postgres.abc@host/postgres
```

The identity is printed by any refusal, so there is nothing to guess, and it has
to match the database `DATABASE_URL` currently points at. A production import
cannot happen as a consequence of an un-reverted `DATABASE_URL`.

## Removing an import again

This is the part that makes a demo safe.

```bash
pnpm --filter @vardenia/web import:listings --describe keserwan-2026-08
pnpm --filter @vardenia/web import:listings --remove keserwan-2026-08 --dry-run
pnpm --filter @vardenia/web import:listings --remove keserwan-2026-08
```

Removal deletes the QR codes first and then the listings. That order matters:
the permission to delete a protected code is read off the listing, so deleting
the listing first would leave its code permanently undeletable.

Expect it to take about as long as the import did.

### Why removal needs a hole in a safety rule

`hooks/protectPrintedCodes` refuses to delete a code that has been scanned or
assigned to a print issue. That rule exists because a real code was already
stranded once - a listing was deleted and recreated during testing and its code
silently changed - and after a print run every copy of the old code points at
nothing for a year.

A demo directory hits that rule immediately: somebody scans one code to show it
working, and that row can never be cleaned up.

So teardown is allowed past the guard, and the permission is deliberately not
"the caller asked". The hook re-reads the listing and proceeds only when the
listing itself carries the exact batch being removed. `importBatch` is read-only
and staff-only in the admin panel, so a listing a person created has none and
cannot be reached this way, whatever a caller claims.

A listing whose code refuses to go is left in place rather than deleted around,
because deleting it would orphan the code and remove the only route to cleaning
it up later.

## What the mapping fills, and what it leaves behind

**It only writes fields the collection already had.** A spreadsheet always
carries more than the site models, and the temptation is to add a column for
each. That is how an import ends up dictating the shape of the product.

| Sheet column           | Becomes                                                       |
| ---------------------- | ------------------------------------------------------------- |
| Category               | `category` and one `subcategory`                              |
| Hotel Stars            | picks luxury or boutique for a hotel                          |
| District               | `district`                                                    |
| Location               | `address`                                                     |
| Name / Listing         | `name`, `slug`                                                |
| Rating / 5             | `googleRating`, with `ratingCheckedAt` set to the import date |
| Price Range            | `priceRange`, banded on the lower figure                      |
| Type / Activity        | `tags`, split on the separators the sheet uses                |
| Usually When           | `seasonality`                                                 |
| Overview / Description | `tagline` and `description`                                   |

Left in the spreadsheet on purpose:

- **Phone, Instagram, Email.** There are no contact fields on a listing, and
  adding them is a decision about what a listing page is for, not one an
  importer gets to make.
- **Reviews and Founder.** Somebody else's words, which would be published as
  ours.
- **Class, Rating as Written, Source Paragraphs.** Bookkeeping from whoever
  built the sheet.

Every listing gets a shared placeholder photograph, because `heroImage` is
required and these have none. It is deliberately ugly and labelled, so nobody
mistakes it for real photography.

## Things a source gets wrong, which are reported rather than fixed

Run against the Keserwan directory, 56 of 308 rows raised something:

- **Rows that contradict themselves.** "Four Season Halat - Halat" is filed
  under Location `Kaslik`. Neither value is guessed at, because a listing in the
  wrong town is a printed code pointing at the wrong page.
- **Rows spanning two districts.** Filed under the first and flagged.
- **Slug collisions** after cleaning, including genuinely duplicated names. The
  later one gets a numeric suffix.
- **A season the site cannot express.** "September-October" is autumn, and the
  field offers only year-round, summer and winter, so it is left blank rather
  than rounded into summer.
- **Rows with no district.**

None of these stops the import.

## No spreadsheet is in this repository

`*.csv` is gitignored. A directory of businesses is data, not code, and none of
it should reach a git history.

The tests do not use a file either. `src/import/sample-listings.ts` is twenty
rows written out as string literals, each with a note saying which awkwardness
of the real export it reproduces - the stars in a name, the location suffix that
agrees and the one that contradicts, the duplicate name, the description full of
commas, the autumn festival. Written literally rather than built by a helper, so
that a fixture generated by an escaping function cannot share a bug with the
parser it is testing and have the two cancel out.

## Adding a new source

The mapping tables are at the top of `src/import/listing-row.ts`. A category
heading that is not in `CATEGORY_BY_HEADING` makes the row unmappable rather
than guessed at, and unmappable rows are counted and named rather than dropped
quietly.
