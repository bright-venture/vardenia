# Sample (mock) listings flag - short design

Date: 2026-11-26. Status: approved by the user in conversation.

## Intent and why

Production holds about 408 mock listings. Real businesses will start arriving through the
magazine places form in a few days. Mock ones must stay visible to visitors, but be marked as
fake, hold no magazine number, and never be mixed with real businesses in staff views.

## Goals

- Permanent `isSample` flag on businesses. Default false, so everything created later is real.
- The deploy migration sets it true on every existing business (all are mock today).
- A sample listing never holds a listing number (so page numbers are free for real businesses).
- An admin can tick or untick the flag on any business in the admin.
- Staff queues, counters and reports ignore sample rows by default; a "Sample listings" filter shows them.

## Non-goals / anti-goals

- No public "Sample" badge. Visitors see mock listings exactly as today.
- No backup table, no restore of old numbers (decided: current numbers are meaningless).
- Not deleting the mock listings now.
- The public form must never be able to set the flag.

## Constraints

- Migrations apply automatically on a production deploy (scripts/deploy-migrate.sh), together
  with the two never-run payment migrations. This one runs last and changes no data.
- Unique index (issue, listingNumber) ignores nulls, so many sample rows with no number are fine.

## Approaches considered

1. Boolean column on businesses (chosen): simple, survives renames and reimports, editable in admin.
2. List of ids/slugs in code: fragile.
3. Move mock rows to another table: breaks public pages and QR codes.

## Design

- Field `isSample` (checkbox, default false, sidebar). Update access: admin only. Not writable by the public form route.
- Migration (last): add `is_sample boolean NOT NULL DEFAULT false` only if missing. No back-fill: the owner flags
  the existing mock rows by hand with SQL (`is_sample = true, listing_number = NULL`).
  Down: drop the column (numbers are not restored).
- Hook: `releaseListingNumber` also clears `listingNumber` when `isSample` is true (on create and update).
  Unticking does not restore a number.
- Staff views: queues are status-based, so mock rows already stay out of them. Added Sample/Real
  chips on the Businesses list and the contracts-report exclusion (sample listings are left out of it).
- Public site: unchanged.

## Left to the builder

- Check whether the magazine reader / page editor assume every listing has a number.
- Test migration up and down on a scratch database; test hook, form, reports.
