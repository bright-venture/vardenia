# ADR 0004 - Scan analytics stay in Postgres until they don't

- **Status:** Accepted
- **Date:** 2026-08-06

## Context

`scan-events` is append-only and grows with every QR scan. It is also the single most
commercially important table in the system: it is the evidence behind every renewal
conversation. The temptation is to reach for ClickHouse, BigQuery, or a product-analytics
SaaS on day one.

## Decision

Scan events are a normal Postgres table, written through Payload with `overrideAccess`,
from exactly one place (the `/g/:code` route handler). No warehouse, no analytics SaaS.

## Rationale

Realistic near-term volume: 20,000 magazines x a generous 15% scan rate x a few scans each
is on the order of tens of thousands of rows per issue. Postgres handles that without
noticing. Indexed on `code`, `scannedAt`, `business`, `country`, and `placement`, advertiser
dashboards are simple aggregate queries.

Sending scan data to a third-party analytics product would also mean sending reader
location data off-platform, which cuts against the privacy posture in ADR 0002 and
complicates the GDPR story for the European audience.

## Migration trigger

Move to a columnar store when **any** of these is true:

- `scan-events` exceeds ~50 million rows, or
- the advertiser dashboard's p95 query time exceeds 500 ms with correct indexes, or
- we need retention beyond three years for trend reporting.

## Migration path

Writes already funnel through `recordScan()` in `apps/web/src/app/g/[code]/route.ts`, and
reads for advertiser dashboards should be kept behind a single query module. Dual-write
from `recordScan()`, backfill, cut reads over, drop the table. One file changes on the
write side.

## Consequences

- No analytics infrastructure to run or pay for now.
- We must resist adding ad-hoc `scan-events` queries throughout the codebase; every read
  goes through the dashboard query module, or the migration above stops being cheap.
