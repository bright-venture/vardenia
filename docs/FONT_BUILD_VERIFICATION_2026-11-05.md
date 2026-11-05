# Font build verification — 5 November 2026

## Result

The current application passes the **whole-app webpack production compile-only build** with the existing approved fonts unchanged. Exit status: 0. This is compilation verification, not a deployment, full prerender/data-generation build, or production database test.

## Earlier failure

The earlier webpack log reported `TypeError: Cannot read properties of null (reading '1')` in Next 16.4.2's compiled Google font loader, line 122, while processing `Noto_Sans_Bengali` from `src/app/fonts.ts`.

That line extracts the extension with `/\.(woff|woff2|eot|ttf|otf)$/.exec(googleFontFileUrl)[1]`. A URL without one of those suffixes makes that expression fail. The earlier response body was not preserved, so the exact upstream URL or response that caused it cannot be established retrospectively.

A fresh request through the installed Next loader to Google's CSS endpoint for `Noto Sans Bengali` at weights 400, 500 and 700 returned three distinct `.woff2` URLs. Invoking the same production loader downloaded all three successfully; each had a valid `wOF2` signature (13,608, 25,652 and 107,884 bytes). The complete webpack compile-only build then passed without font changes, replacement packages, mocks, loader patches, or network-security bypasses.

**Conclusion:** the observed failure was in the remote font-loading path and is not currently reproducible. There is no evidence that the local homepage, reader or SEO source changes caused it. A transient upstream response/loader incompatibility is consistent with the evidence; the original response is unavailable, so its exact cause remains unproven. No source workaround is warranted on current evidence.

## Safe verification procedure

The existing reader documentation permits compile-only verification without a database. Next's installed CLI confirms `--webpack --experimental-build-mode compile` is supported.

For this run:

- Confirmed no `.env`, `.env.local`, `.env.production`, or `.env.production.local` files in the repository root or web application directory before starting.
- Created a child environment containing only executable path/home/temp, normal proxy and certificate settings, and the explicit local values below. No inherited application credentials were passed.
- Set `NODE_ENV=production`, `NEXT_TELEMETRY_DISABLED=1`, `NEXT_PUBLIC_ALLOW_INDEX=false`, `MEDIA_STORAGE_ADAPTER=local`, and `NEXT_PUBLIC_SITE_URL=http://localhost:3000`.
- Used `DATABASE_URL=postgresql://localcheck:localcheck@127.0.0.1:1/localcheck` and `PAYLOAD_SECRET=local-compile-only-placeholder-not-for-production`.
- Ran `node scripts/prepare-reader.mjs` from `apps/web` as required by the reader build workflow, followed by `node node_modules/next/dist/bin/next build --webpack --experimental-build-mode compile`.

The successful run compiled the current full route graph, including the magazine reader. A release still requires the normal full production build and deployment checks in its authorized environment. Compile-only deliberately does not validate live database content or page generation.
