# ADR 0005 - The data model is single-country on purpose

- **Status:** Accepted
- **Date:** 2026-08-06

## Context

The business plan targets expansion into Cyprus, Greece, Turkey, Jordan, Egypt, the UAE,
and Saudi Arabia. It is tempting to build a `country` dimension into every collection now,
"so we don't have to redo it later."

## Decision

Model Lebanon only. `regions.ts` contains Lebanese governorates, coordinates are validated
against a Lebanon bounding box, times are `Asia/Beirut`, and there is no `country` field on
listings.

## Rationale

A multi-country model is not one extra column. It is per-country taxonomy variance (ski
resorts matter in Lebanon, desert tourism in the UAE), per-country currency and price
banding, per-country legal pages, per-country locale sets (Greek, Turkish), separate
editorial teams with separate permissions, and a domain strategy. Building that abstraction
before we know how a second market actually differs means guessing - and multi-tenancy
guessed wrong is far more expensive to unwind than single-tenant code is to extend.

The concrete second-market question we cannot answer yet: is a country edition a separate
deployment with its own database, or a tenant in one database? That depends on whether
editorial teams are franchised or in-house, which is a business decision that has not been
made.

## What we do now to keep the door open

- Region data is isolated in one file (`packages/core/src/regions.ts`).
- The bounding-box check is a single function (`isWithinLebanon`), not scattered validation.
- Locale handling is generic; adding Greek is a config change, not a rewrite.
- Nothing in the schema _assumes_ one country beyond the region enum.

## Revisit when

A second market is contractually committed with a named editorial lead. At that point write
ADR 0006 deciding tenancy model, and expect roughly a two-to-four week migration. That is
the correct price to pay _then_, with real requirements, rather than a speculative one now.
