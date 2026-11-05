import pdfPackage from 'pdfjs-dist/package.json'

export const PDFJS_ASSET_BASE = `/pdfjs-assets/${pdfPackage.version}`

/** PDF.js is already an ESM bundle with its own webpack runtime. Asking
 * Next's webpack dev compiler to wrap it again can collide with its exports
 * (mozilla/pdf.js#20478, vercel/next.js#89177). Import the unmodified ESM in
 * the browser instead. All files are copied from our pinned npm package and
 * served by this site; no eval, CDN, global script or relaxed CSP is needed.
 * The versioned directory prevents mismatched renderer/worker assets. */
export async function loadPdfJs(): Promise<typeof import('pdfjs-dist')> {
  const moduleUrl = `${PDFJS_ASSET_BASE}/pdf.min.mjs`
  const pdfjs = await import(/* webpackIgnore: true */ /* @vite-ignore */ moduleUrl)
  pdfjs.GlobalWorkerOptions.workerSrc = `${PDFJS_ASSET_BASE}/pdf.worker.min.mjs`
  return pdfjs
}
