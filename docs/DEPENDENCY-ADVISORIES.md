# Dependency advisories

`pnpm audit --prod` is the check. This file is the record of what was done about
it, because `package.json` cannot hold comments and an `overrides` block with no
explanation is impossible to retire safely later.

Re-read this whenever the audit output changes. An override that is no longer
needed is not harmless: it pins a version the rest of the tree has moved past.

## What is pinned, and why

The `pnpm.overrides` block in the root `package.json` forces four transitive
packages forward. None of them is a direct dependency, so there is nothing to
upgrade in the ordinary way - the fix has to be applied to the whole tree.

| Package   | Forced to | Fixes                                                          | Owned by                             |
| --------- | --------- | -------------------------------------------------------------- | ------------------------------------ |
| `undici`  | `^7.29.0` | cross-user information disclosure (high), plus three moderates | `payload`                            |
| `postcss` | `^8.5.23` | path traversal and arbitrary file read (high), XSS, two more   | `next`, `vite`, `@expo/metro-config` |
| `nanoid`  | `^3.3.18` | infinite loop with custom generators (high)                    | `expo-router`, `postcss`             |
| `sharp`   | `^0.35.3` | inherited libvips vulnerabilities (high)                       | `next`                               |

`sharp` is also a direct dependency of `apps/web`, raised to `^0.35.3` there.
The override exists because Next ships its own copy and the two have to agree -
two versions of a native module in one tree is how you get a build that works
locally and fails on the host.

All four stay inside their existing major, so nothing here is a migration. The
verification was the ordinary one: install, typecheck, 966 tests, a production
build of all 93 pages, and a live upload proving sharp still processes images.

## Resolved

**`next-intl` 3.26.5 to 4.13.7**, upgraded 25 Aug 2026. Closed both advisories -
the open redirect and the prototype pollution. Three things it needed, none of
which the type checker or the test suite would have caught on its own:

- **`localeCookie: false`** in `i18n/routing.ts`. v3 had one setting;
  `localeDetection: false` turned off Accept-Language detection _and_ the
  NEXT_LOCALE cookie. v4 split them into two options that both default to
  `true`, so the upgrade alone would have started setting a year-long locale
  cookie on every visitor. Verified by removing the line again: the cookie
  reappeared on all four request shapes.
- **Dropping `messages` from `NextIntlClientProvider`.** v4 inherits the
  catalogue from `i18n/request.ts`; passing it is now redundant.
- **`server.deps.inline: ['next-intl']`** in `vitest.config.ts`. v4 is ESM only
  and imports `next/server` as a bare specifier, which does not resolve from
  inside next-intl's own directory under pnpm. A build was fine; the tests were
  not.

## What is knowingly left alone

Three advisories survive the overrides. Each is a deliberate decision rather than
an oversight, and each has a condition that would change the answer.

### `image-size` - high, no fix exists

Denial of service in the ICNS, JXL and HEIF parsers. The advisory lists no
patched version, so there is nothing to move to.

Reachable only through Next's image handling. The upload allowlist in
`collections/Media.ts` accepts JPEG, PNG, WebP, AVIF, MP4 and PDF - none of the
three affected formats - and uploading is staff-only. **Revisit when a patched
version ships, or immediately if HEIC is ever added to the allowlist**, which
has been discussed, because that is the format an iPhone produces by default.

### `uuid` - moderate, unreachable

Missing buffer bounds check in v3, v5 and v6 when a `buf` argument is passed.
Two copies exist, and the flagged one is `7.0.3`, pulled in transitively.

Nothing in this codebase calls `uuid` at all - ids come from Postgres, tokens
from `node:crypto`. Reaching this needs a caller that passes a buffer, and there
is no such caller. Overriding to `>=11.1.1` would mean forcing a package from v7
to v11 across a major that went ESM-only, which is a real risk of breakage in
exchange for closing a path nothing walks.

### `esbuild` - moderate, build-time only

Any website can send requests to the esbuild **dev server** and read the
response. Pulled in at `0.18.20` through `drizzle-kit`, which Payload uses for
migrations.

That dev server is never started here. `drizzle-kit` runs during
`pnpm migrate`, on a developer machine or in CI, and exits. Forcing esbuild to
`0.25` across the tree to close a server nobody runs risks breaking migrations,
which is the one tool that must work when it is needed.

## Running the check

```bash
pnpm audit --prod
```

`--prod` matters. Without it the output is dominated by build tooling that never
reaches a running site, and a list nobody can act on is a list nobody reads.
