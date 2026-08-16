# Vardenia

Lebanon's premium tourism, lifestyle, and digital discovery platform - magazine, website,
mobile app, and QR layer over one content spine.

## Quick start

Requires Node >= 20.9 and pnpm 9. The database is hosted (Supabase) - nothing to install.

First, set up a database: **[docs/DATABASE-SETUP.md](docs/DATABASE-SETUP.md)** (~10 minutes,
free, once). Then:

```bash
pnpm install
```

```bash
cp .env.example .env
```

Paste your database connection string into `.env`, then:

```bash
pnpm --filter @vardenia/web seed
```

```bash
pnpm dev
```

- Public site - http://localhost:3000
- Admin CMS - http://localhost:3000/admin (`admin@vardenia.local` / `ChangeMe123!`)
- REST API - http://localhost:3000/api
- QR redirect - http://localhost:3000/g/:code

## Workspace

| Path                  | What it is                                                    |
| --------------------- | ------------------------------------------------------------- |
| `apps/web`            | Next.js 15 + Payload 3 - site, CMS, API, QR redirect          |
| `apps/mobile`         | Expo / React Native app                                       |
| `packages/core`       | Taxonomy, regions, listing tiers, QR codes, wire schemas      |
| `packages/api-client` | Typed API client. Not wired up - see the note in its index.ts |
| `packages/i18n`       | Locales, RTL direction, formatting, message catalogues        |
| `packages/tokens`     | Design tokens - the only place brand values live              |
| `packages/tsconfig`   | Shared TypeScript configs                                     |

## Common commands

Start the website + CMS (this is the one you want day to day):

```bash
pnpm dev
```

Start the Expo app instead:

```bash
pnpm dev:mobile
```

```bash
pnpm typecheck
```

```bash
pnpm --filter @vardenia/web generate:types
```

```bash
pnpm --filter @vardenia/web migrate:create
```

## Before you change anything

Read [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Two constraints drive most of the
design and are easy to violate by accident:

1. **A printed QR code is permanent.** Codes are immutable; only their destinations change.
2. **Slugs are part of the print contract.** Changing one breaks copies already in
   circulation.

Decisions and their reasoning are in [`docs/adr/`](docs/adr/).
