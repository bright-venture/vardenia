# Working in this repository

Read [ARCHITECTURE.md](ARCHITECTURE.md) before making structural changes. The reasoning
behind the bigger decisions lives in [adr/](adr/).

## Rules that protect printed material

Breaking any of these breaks something already in circulation, and you find out from an
advertiser rather than from a test.

- **`qr-codes.code` never changes.** Do not edit it, and never delete a `qr-codes` row that
  has shipped in print. Deactivate it instead by setting `active: false`.
- **The `/g/:code` route must never return 404**, and must never wait on analytics before
  redirecting.
- **Redirects stay 302.** A 301 gets cached by the browser forever, which stops repeat scans
  being reported. Repeat scans are the number advertisers pay for.
- **Slugs are permanent.** They appear in print and in indexed URLs.
- **Category and region slugs are never deleted.** Retire them with `retired: true`.
- **Payload's tables stay out of the `public` schema** (`schemaName: 'payload'`). Supabase
  serves a browser-reachable REST API over `public`, and the Commercial tab must never sit
  in it.

## Where a change belongs

| Change                      | Goes in                                            |
| --------------------------- | -------------------------------------------------- |
| New category or region      | `packages/core/src/taxonomy.ts` or `regions.ts`    |
| Brand colour, type, spacing | `packages/tokens`, never hardcoded in a component  |
| New advertiser capability   | `packages/core/src/tiers.ts`                       |
| Public API response shape   | `packages/core/src/schemas.ts`                     |
| Anything an editor types    | A Payload collection in `apps/web/src/collections` |

## Conventions

- Prettier: no semicolons, single quotes, 100 columns. Run `pnpm format`.
- Source files are ASCII only. Arabic content in the taxonomy and message catalogues is the
  exception, because it is real data.
- Workspace packages export TypeScript source and have no build step. Use relative imports
  without a file extension (`from './taxonomy'`). Metro cannot reliably map `.js` back to
  `.ts`.
- `apps/web` runs React 19 and `apps/mobile` runs React 18. Do not turn on
  `auto-install-peers` or a hoisted node linker in `.npmrc`. Both collapse `@types/react`
  into a single version and break one of the two apps.
- Access control returns **query constraints**, not booleans, anywhere a role is scoped to
  its own records. Booleans leak enumerable data through the API.
- Anything on a listing's Commercial tab is staff only and must never reach a public
  response. Public shapes are defined in `packages/core/src/schemas.ts`.
- Regenerate Payload types after a schema change:
  `pnpm --filter @vardenia/web generate:types`.

## Arabic and right-to-left

Arabic is a first-class locale, not a translation layer. Check any new layout at `/ar`.

Text direction comes from `dirFor()` in `@vardenia/i18n`. Never hardcode `dir="ltr"`, and
prefer logical CSS properties (`margin-inline-start` rather than `margin-left`) so a layout
mirrors correctly without a second stylesheet.
