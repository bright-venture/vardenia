# Built-in magazine reader

The existing issue detail page opens an on-demand reader when an edition PDF is
attached. It uses the same issue records for regional and national editions;
no sample editions or production data are added.

## Reader

- Mozilla PDF.js renders locally in the visitor's browser. No third-party viewer,
  subscription, CDN script, or PDF upload is involved.
- Desktop supports a separate cover followed by two-page spreads, or single-page
  mode. Narrow screens use one page. Landscape first pages default to single-page
  mode because the PDF may already contain spreads. PDF page order is preserved.
- Previous/next, typed page number, Home/End and left/right keys, touch swipes at
  Fit zoom, whole-page Fit, zoom to 400%, and an expanded modal reading area are available.
- Page turns use 3D paper snapshots, bypassed for reduced-motion preference. Turn
  controls resist repeated clicks; Home/End can interrupt a turn. This is a custom
  reader inspired by the reference, not FlippingBook or feature parity.
- Page text is available through a separate toggle. Scanned/image-only pages
  require an accessible source PDF or the existing web articles. Canvas rendering
  alone is not a substitute for a tagged, accessible PDF.
- Controls are translated for all ten existing site locales. Printed link annotations are not interactive in the canvas; use the original
  PDF to follow its embedded links. Original PDF and article links remain available if rendering is unsupported or fails.

## Delivery and permissions

`/read/issue/[slug]` looks up the existing issue with `overrideAccess: false` and
serves only its populated public media PDF. It takes no arbitrary URL, sends no
visitor cookies upstream, rejects redirects, and allows only the configured
public storage origin and bucket. Local files are restricted by safe filename,
real path containment, PDF signature and size.

The reader requests 1 MiB chunks with PDF.js range support enabled. Streaming and
speculative auto-fetch are disabled in PDF.js so a range-capable server does not
continue downloading the entire file in the background. Storage without valid
range support falls back to a complete download; the original-PDF link remains.

The delivery endpoint accepts one standard byte range, validates upstream 206
intervals and lengths, rejects multipart/malformed ranges, and streams with
backpressure rather than buffering the entire file. It advertises ranges only
when storage actually supports them and the total length is known. Offset-zero
full responses validate the PDF signature before sending the body. Local files
are read with 64 KiB streams and the same realpath/filename protections.

The read limit is 256 MiB, accommodating the supplied 76 MB Keserwan PDF. This
**does not change the existing 25 MiB CMS upload limit** or upload any file. New
large issue uploads still need a separately reviewed ingestion path/policy.
Request metadata waits and upstream transfers are bounded by 60 seconds and
client cancellation. Payload does not expose query cancellation: an already-running DB query can
outlive the caller. Backend statement timeouts/cancellation remain separate
hardening work; late results cannot start file delivery or keep reader slots
occupied. Per-IP,
per-instance rate limiting allows 240 requests/minute for normal range traffic;
at most eight streams are active per instance. The existing shared IP resolver
trusts proxy headers; platform/header trust hardening remains a deployment review
item, and this patch does not change that global policy. Slots now remain held through
stream EOF, cancellation or timeout rather than releasing at response creation.
There is no shared CDN cache of the endpoint. Large-file hosting behavior and
actual-PDF network/render performance still require staging/Mac verification.

No CSP or storage access permissions are changed. PDF evaluation is disabled;
WebAssembly is disabled to respect the existing CSP; files requiring unsupported
image decoders can still be opened through the original-PDF link.
The renderer does not create scripting, form or annotation execution layers.

## Assets and development

`pnpm --filter @vardenia/web dev` and `build` run
`scripts/prepare-reader.mjs` to copy the unmodified PDF.js renderer, worker, CMaps,
fonts and image decoder assets to `public/pdfjs-assets/<package-version>/`. This
generated directory is ignored by Git. The renderer loads through a native browser
ESM import, and its worker is a same-origin, version-matched static module. Next
must not rebundle the renderer: the prebuilt PDF.js webpack runtime collides with
Next webpack dev exports (Mozilla issue #20478 / Next issue #89177). If invoking `next` directly, run
the preparation script first. The pinned PDF.js 5.4.624 requires Node 20.16 or newer. It is outside the
affected ranges of Mozilla advisories GHSA-wgrm-67xf-hhpq (fixed in 4.2.67) and
GHSA-hq66-cqwq-w95j (introduced in 5.6.83). It is not the current major release;
review updates and security advisories before deployment and during maintenance.
Keep the pinned PDF.js package, worker and copied
assets at the same version when upgrading.

## Verification

Unit coverage includes spread boundaries, desktop/mobile navigation, zoom,
loading/retry/disposal, original-PDF fallback, same-origin routing, bucket/path
restrictions, public access flags, redirect refusal, byte limits, cancellation,
and rate/concurrency rejection. PDF.js parser/canvas rendering was also exercised
with a synthetic six-page test document, not a real magazine.

Production compile-only build is usable without connecting a database. It is
not a production deployment or full data-generation build. Real-browser mobile
and screen-reader checks, real PDFs, and storage/hosting delivery remain staging
acceptance steps; no production credentials were used for this work.

## Webpack dev compatibility regression

Mac browser QA found that `import('pdfjs-dist')` failed before any PDF request with
`Object.defineProperty called on non-object`. This is the upstream nested-webpack
ESM export collision described in [Mozilla #20478](https://github.com/mozilla/pdf.js/issues/20478)
and [Next #89177](https://github.com/vercel/next.js/issues/89177).

The reader uses `load-pdfjs.ts` with `webpackIgnore` to preserve native browser
import of the copied ESM. The preparation script keeps renderer and worker
byte-identical to the pinned package under the same versioned directory. Do not
replace this with a normal runtime package import without browser regression QA.
Unit tests check this boundary and copied bytes, but cannot replace real-browser
validation. After syncing this fix to a preview, run the preparation script and
restart dev; then verify the renderer module, worker and PDF requests, page turns,
zoom and text extraction in both Chrome and the in-app browser.

## Progressive-loading acceptance checklist

- Use the real PDF fixture on the Mac without uploading it or changing CMS data.
- After Open reader, verify one initial metadata request is canceled and multiple
  `206 Partial Content` requests have `Range` / matching `Content-Range` headers.
- First-page display should not wait for all 76 MB. Jump to a distant page, zoom,
  revisit an earlier page, and verify no missing content or duplicated pages.
- Record bytes transferred before first render and after a distant-page jump.
  PDF structure can require substantial early data even with ranges enabled.
- Check a small PDF and a server with no Accept-Ranges: complete-download fallback
  must still work. Confirm cancel/navigation stops active network transfers.
- The fixture server verifies browser behavior; production delivery also needs
  an authorized staging test against the actual storage/hosting path.
