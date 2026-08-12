/**
 * What a code points at, and whether that is safe to print.
 *
 * Split out from qr-image.ts so the admin preview can import it. That module
 * pulls in the `qrcode` renderer, which is server-side only - importing it from
 * a client component would drag the whole encoder into the browser bundle.
 * These two functions are pure string work with no dependencies.
 */

/** What the code actually encodes. Never the destination - see packages/core/src/qr.ts. */
export function scanUrl(code: string, siteUrl = process.env.NEXT_PUBLIC_SITE_URL): string {
  const base = (siteUrl ?? 'http://localhost:3000').replace(/\/$/, '')
  return `${base}/g/${code}`
}

/**
 * Whether the domain baked into these codes is one the public can actually reach.
 *
 * The host is not a rendering detail: it is printed into the symbol and cannot be
 * changed afterwards. Generating a sheet on a laptop and sending it to press
 * produces 20,000 copies pointing at localhost, which fail silently for every
 * reader and cannot be repointed the way a destination can. Nothing here blocks
 * generation - previewing locally is normal and useful - but every surface that
 * offers a print download says so out loud.
 */
export function isPrintSafeBaseUrl(siteUrl = process.env.NEXT_PUBLIC_SITE_URL): boolean {
  const base = siteUrl ?? ''
  if (!base.startsWith('https://')) return false
  return !/^https:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(base)
}
