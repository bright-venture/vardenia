# Importing listings from a spreadsheet

Turns a directory held in Excel into draft listings, each owning a QR code, so a
designer can be handed a sheet of codes.

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

A listing is slow to write: a lookup, a create, a QR code minted by a hook that
runs several queries of its own, and a link back. Measured through this
endpoint against the development database, that is **3.4 seconds each** - 308
listings in 1052 seconds over 62 windows.

A Netlify function is killed at ten seconds, so an import cannot run inside one
request. The browser holds the loop instead, because a browser tab has no
timeout, and asks for a window of listings at a time.

**The window sizes itself.** It starts at one, times the round trip, and grows
while windows stay under six seconds, never more than doubling and never past 25. That is not tuning for its own sake: a fixed window of five was the first
version, and at 3.4 seconds a listing it took 17 seconds - so it worked on a
laptop and would have been killed in production, where the function is in
us-east-1 and the database is in Frankfurt. The client cannot know that distance
in advance, so it measures instead of guessing.

A window either finishes or it does not, and one that fails can simply be sent
again: every write is skipped when the slug already exists. That also means it
is safe to close the tab and start again later - re-importing the same file with
the same batch name picks up where it stopped.

If a single listing cannot be written inside the function's limit, the browser
route cannot work at all on that deployment. Use the command line, which runs
from your machine and is not subject to it.

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
