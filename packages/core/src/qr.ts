/**
 * QR short codes.
 *
 * The rule that drives this whole design: **a printed code is immutable.** Once
 * 20,000 copies of the magazine are in airport lounges, that code exists forever
 * and we cannot change it. So a code is a stable opaque handle, and what it
 * *points at* is editable in the CMS. If a restaurant rebrands or moves, we
 * re-point the code - the print run stays valid.
 *
 * Codes therefore never encode the target. `vrd.lb/K3M9QP2` and nothing else.
 */

/**
 * Crockford base32 minus I, L, O, U - removes 0/O and 1/I/L confusion when
 * someone types a code off a page, and drops U so no code spells anything rude.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
export const CODE_LENGTH = 7

/** ~34 billion codes; collision risk stays negligible well past a million listings. */
export function generateCode(random: () => number = Math.random): string {
  let code = ''
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += ALPHABET[Math.floor(random() * ALPHABET.length)]
  }
  return code
}

/** Accepts sloppy human input - lowercase, spaces, and the confusable letters. */
export function normalizeCode(input: string): string | null {
  const cleaned = input
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0')
    .replace(/U/g, 'V')
  if (cleaned.length !== CODE_LENGTH) return null
  if (![...cleaned].every((char) => ALPHABET.includes(char))) return null
  return cleaned
}

/** What a scan resolves to. Extend as new surfaces ship. */
export const QR_TARGET_TYPES = [
  'business',
  'article',
  'offer',
  'issue',
  'category',
  'external',
] as const
export type QrTargetType = (typeof QR_TARGET_TYPES)[number]

/**
 * Where the physical code lives. Attribution is the product: an advertiser needs
 * to know the airport-lounge placement outperformed the in-restaurant decal.
 */
export const QR_PLACEMENTS = [
  'magazine-page',
  'window-decal',
  'table-tent',
  'billboard',
  'business-card',
  'digital',
  'event',
] as const
export type QrPlacement = (typeof QR_PLACEMENTS)[number]

export interface ScanContext {
  code: string
  /** Set from the print issue the code was assigned to, not from the request. */
  placement: QrPlacement
  scannedAt: Date
  /** Coarse only - city-level. We deliberately do not store precise scan coords. */
  city: string | null
  country: string | null
  platform: 'ios' | 'android' | 'web' | 'unknown'
  /** Distinguishes a genuine scan from a crawler or a link shared onward. */
  isDirectScan: boolean
}
