# Hand-written SQL migrations

Historical. **Do not run these on a new database.**

These two files were written before the project had Payload migrations, when the
only database was the one Payload's dev `push` had built incrementally. They edit
a schema that already exists:

| file                                    | what it did                                       |
| --------------------------------------- | ------------------------------------------------- |
| `0001-placement-magazine-page-only.sql` | Narrowed the QR placement enum to `magazine-page` |
| `0002-remove-offers.sql`                | Dropped the offers tables, columns and enums      |

Both have been applied to the Supabase database. Neither is needed again.

The schema they produced is now captured in full by
`apps/web/src/migrations/20260813_123246_baseline.ts`, which builds everything
from empty. A new environment runs that, not these. Running `0002` against a
fresh database fails immediately, because it opens by dropping a table the
baseline never creates.

They are kept because they record why two enums are narrower than they look, and
that rewriting `scan_events.placement` discarded the original `digital` values.

## From here on

Schema changes go through Payload:

```bash
pnpm --filter @vardenia/web migrate:create <name>   # generate from the collections
pnpm --filter @vardenia/web migrate                 # apply (production)
```

See `docs/DATABASE-SETUP.md`.
