# ADR 0003 - Taxonomy and regions live in code, not in the CMS

- **Status:** Accepted
- **Date:** 2026-08-06

## Context

The directory has seven top-level categories and roughly fifty subcategories, plus eight
governorates and their districts. The obvious CMS-shaped answer is a `categories`
collection with a self-relation for hierarchy.

## Decision

They live in `packages/core/src/taxonomy.ts` and `regions.ts` as TypeScript constants.
Payload exposes them as `select` field options generated from those constants.

## Rationale

- **They must be identical across four surfaces.** Website filters, app browse tabs, CMS
  dropdowns, and printed section dividers all have to agree. Code shared by all consumers
  guarantees that; a database table guarantees only that they _started_ in agreement.
- **They change roughly twice a year**, on the print cycle - which is a deploy cadence, not
  a content cadence.
- **A CMS-editable taxonomy invites drift.** "Boutique Hotels" and "Boutique hotel" both
  existing is a data-quality problem that takes a migration to fix and is easy to prevent.
- **Slugs become part of the URL contract**, and URLs get printed. A code review is the
  right gate for creating one; a text input at 2am is not.

## Consequences

- Adding a category requires a code change and a deploy. Accepted.
- Category slugs must never be deleted once shipped - printed QR codes and indexed URLs
  point at them. `Category.retired` exists for this; use it instead of deletion.
- If editors later need per-category editorial content (a hero image, an intro essay), that
  becomes a _separate_ `category-pages` collection keyed by slug. The taxonomy stays in
  code; only the prose moves into the CMS.
