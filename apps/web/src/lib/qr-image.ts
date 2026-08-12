import QRCode from 'qrcode'
import { normalizeCode } from '@vardenia/core'
import { scanUrl } from './qr-url'

/**
 * Rendering a code as something a printer can use.
 *
 * Everything in here is chosen for paper, not for screens. A code on a screen
 * that fails to scan is a refresh; a code on 20,000 printed copies that fails to
 * scan is the whole print run wasted, so the defaults are deliberately
 * conservative even though they make the code slightly denser.
 */

/**
 * Error correction level Q recovers ~25% of the symbol.
 *
 * Level M (~15%) is the usual default and is fine on a screen. Print earns the
 * upgrade: ink spread, varnish, a fold through the code, a scuffed table tent,
 * or a reader photographing it at an angle in a dim restaurant all eat into the
 * same budget. Q costs a slightly denser grid and buys a code that still works
 * after the physical world has had a go at it.
 */
const ERROR_CORRECTION = 'Q' as const

/**
 * The quiet zone, in modules. Four is the spec minimum and it is not optional.
 *
 * This is the single most common way a printed code dies: a designer sees empty
 * white space, crops it to make the code sit tighter in the layout, and the
 * scanner can no longer find the symbol's edges. Baking the margin into the SVG
 * means cropping it takes deliberate effort rather than happening by default.
 */
const QUIET_ZONE_MODULES = 4

/**
 * Default printed size. Roughly the smallest that scans reliably at arm's length
 * from a phone held over a magazine page.
 *
 * Anything under about 20mm starts failing for readers with older phones or
 * unsteady hands, which is exactly the audience least likely to try twice.
 */
export const DEFAULT_PRINT_MM = 25
export const MIN_PRINT_MM = 15

export { isPrintSafeBaseUrl, scanUrl } from './qr-url'

/**
 * Vector, because print scales it.
 *
 * The width and height are rewritten in millimetres so the file lands in a
 * layout tool at its intended physical size instead of some arbitrary pixel
 * count that a designer then has to guess at. The viewBox is left alone, so the
 * code stays infinitely scalable if they do need a different size.
 */
export async function qrSvg(
  code: string,
  { siteUrl, sizeMm = DEFAULT_PRINT_MM }: { siteUrl?: string; sizeMm?: number } = {},
): Promise<string> {
  const svg = await QRCode.toString(scanUrl(code, siteUrl), {
    type: 'svg',
    errorCorrectionLevel: ERROR_CORRECTION,
    margin: QUIET_ZONE_MODULES,
    color: { dark: '#000000', light: '#ffffff' },
  })

  const mm = Math.max(MIN_PRINT_MM, sizeMm)
  return svg.replace(/^<svg([^>]*)>/, (_match, attrs: string) => {
    const kept = attrs.replace(/\s(width|height)="[^"]*"/g, '').trim()
    // Every piece is space-joined rather than concatenated. Dropping the space
    // after `<svg` yields `<svgxmlns=...`, which is served as image/svg+xml and
    // therefore parsed as strict XML - it fails to render with no useful error.
    return `<svg ${kept} width="${mm}mm" height="${mm}mm">`
  })
}

/**
 * Raster fallback, for slide decks and emails where SVG is awkward.
 *
 * Deliberately not offered as the print path. If this ends up in a magazine at
 * anything above its native size it will print soft, and nobody notices until
 * the proofs arrive.
 */
export async function qrPng(
  code: string,
  { siteUrl, pixels = 1024 }: { siteUrl?: string; pixels?: number } = {},
): Promise<Buffer> {
  return QRCode.toBuffer(scanUrl(code, siteUrl), {
    type: 'png',
    errorCorrectionLevel: ERROR_CORRECTION,
    margin: QUIET_ZONE_MODULES,
    width: Math.min(4096, Math.max(64, pixels)),
    color: { dark: '#000000', light: '#ffffff' },
  })
}

/** Rejects anything that is not a well-formed code before it reaches the database. */
export function parseCodeParam(raw: string): string | null {
  return normalizeCode(decodeURIComponent(raw).replace(/\.(svg|png)$/i, ''))
}
