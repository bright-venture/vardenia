# ADR 0002 - QR codes are permanent, destinations are not

- **Status:** Accepted
- **Date:** 2026-08-06

## Context

The magazine prints QR codes. Once an issue ships to airport lounges and hotel rooms, those
codes are in the world for roughly a year and cannot be recalled. Meanwhile the things they
point at are volatile: restaurants rebrand, hotels change their booking provider, listings
get renamed, businesses close.

The naive design - encode the destination in the URL, e.g. `vardenia.com/directory/le-gray`

- fails the moment a slug changes. Every printed copy silently breaks, and we find out from
  an angry advertiser rather than from monitoring.

## Decision

A QR code is an opaque 7-character handle (`vrd.lb/g/K3M9QP2`) stored in the `qr-codes`
collection. The code is immutable: the field rejects updates at the Payload field level,
not merely in the admin UI. What the code _points at_ is a normal editable relationship.

Supporting rules:

- The redirect never returns 404. Unknown codes land on `/scan/not-found`; deactivated
  codes land on `/scan/moved`. Deleting a `qr-codes` row is admin-only and strongly
  discouraged.
- Redirects are **302**, not 301. A 301 is cached indefinitely by browsers, which would
  suppress repeat-scan reporting - and repeat scans are the metric advertisers buy.
- Codes are minted automatically on listing creation, so nobody discovers at layout time
  that half the listings have no code.
- One code per physical placement. A magazine page, a window decal, and a table tent for
  the same restaurant get three codes, because "which placement performed" is the question
  the advertiser will ask at renewal.

The alphabet is Crockford base32 minus `I`, `L`, `O`, `U` - removing `0/O` and `1/I/L`
confusion for anyone typing a code by hand, and removing `U` so no generated code spells
anything embarrassing.

## Consequences

- Roughly 34 billion codes available; collisions are handled with a retry loop regardless.
- Re-pointing a code is a one-field CMS edit, doable by a non-technical editor during a
  phone call with the advertiser.
- `qr-codes.scanCount` is a denormalised display counter. `scan-events` remains the
  authoritative record.
- The counter is incremented with raw SQL (`scan_count = scan_count + 1`) rather than
  through `payload.update()`. Read-modify-write was tried first and lost increments the
  first time it saw two overlapping requests: two rows in `scan-events`, a counter of 1.
  Two people scanning the same table tent at once is the normal case for this product, not
  an edge case. Verified with 8 simultaneous requests, all 8 counted.
- If the counter and `scan-events` ever disagree, trust `scan-events` and recompute. The
  counter exists so a listing page does not have to aggregate the log on every render.
- Not every request counts. `apps/web/src/lib/scan-guard.ts` skips link-preview bots
  (WhatsApp, Slack, Meta and friends fetch a URL the moment it is pasted into a chat),
  collapses repeats from one address within 60 seconds, and caps one address at 20 counted
  scans per 10 minutes. The redirect still happens in every one of those cases: the guard
  protects the number, never access.
- Addresses are salted-hashed and held in memory only, never written. A rate limiter is not
  a reason to start keeping a location history of readers.
- That memory is per-instance and resets on deploy, so the limits are approximate. Fine
  while this runs as one service. If it is ever scaled horizontally, move the two maps to
  Redis or a Postgres table; the interface is one function so the change is contained.
