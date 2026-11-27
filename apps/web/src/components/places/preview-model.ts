import type { Locale } from '@vardenia/i18n'

/**
 * The page shape, in one place. A4 portrait for now; set the real book's
 * ratio here and every template follows (it becomes the `--page-ratio` custom
 * property on the page root).
 */
export const PAGE_RATIO = '210 / 297'

/**
 * Hard limits so typed text fits the page; the templates also line-clamp.
 * The page has no description: the form no longer asks for one (27 November
 * 2026), and an empty body slot would only ever show its placeholder.
 */
export const NAME_MAX = 60
export const TAGLINE_MAX = 90

export type PreviewTemplate = 'a' | 'b' | 'c'

export interface PreviewData {
  name: string
  tagline: string
  category: string
  governorate: string
  address: string
  hours: string
  phone: string
  amenities: string[]
  heroUrl?: string
  galleryUrls: string[]
  logoUrl?: string
  listingNumber?: number
  locale: Locale
}

/**
 * The words shown where a field is still empty. Task 8 passes translated
 * strings; these English defaults keep the components usable on their own.
 * Every key is optional so a caller can override only some.
 */
export type PreviewLabels = Partial<PreviewLabelStrings>
interface PreviewLabelStrings {
  name: string
  tagline: string
  category: string
  governorate: string
  address: string
  hours: string
  phone: string
  amenities: string
  photo: string
}

export const defaultPreviewLabels: PreviewLabelStrings = {
  name: 'Your business name',
  tagline: 'A short line about your place',
  category: 'Category',
  governorate: 'Region',
  address: 'Address',
  hours: 'Opening hours',
  phone: 'Phone',
  amenities: 'Amenities',
  photo: 'Photo',
}

export function emptyPreview(locale: Locale): PreviewData {
  return {
    name: '',
    tagline: '',
    category: '',
    governorate: '',
    address: '',
    hours: '',
    phone: '',
    amenities: [],
    galleryUrls: [],
    locale,
  }
}

/**
 * Trim, then cut to `max` characters (ellipsis included). Counts code points so
 * an emoji or astral character is never split in half.
 */
export function clampText(text: string, max: number): string {
  const trimmed = text.trim()
  const chars = Array.from(trimmed)
  if (chars.length <= max) return trimmed
  return (
    chars
      .slice(0, max - 1)
      .join('')
      .trimEnd() + '\u2026'
  )
}

/** `VARDENIA - 47`, or an empty string while the owner has not set a number. */
export function pageNumberLabel(listingNumber: number | undefined): string {
  return listingNumber === undefined ? '' : `VARDENIA - ${listingNumber}`
}

/** A clamped value, or the placeholder (flagged so it can be styled light). */
export function previewText(
  value: string | undefined,
  placeholder: string,
  max: number,
): { text: string; placeholder: boolean } {
  const text = clampText(value ?? '', max)
  return text ? { text, placeholder: false } : { text: placeholder, placeholder: true }
}

/** What every template receives from BusinessPagePreview (labels already defaulted). */
export interface TemplateProps {
  data: PreviewData
  labels: PreviewLabelStrings
}

/*
 * Layout budget. All heights are in cqw (percent of the page width); the page
 * is PAGE_HEIGHT cqw tall. Each template's worst realistic input is: a name and
 * tagline that wrap to their clamp, an address, hours and phone line, the 11cqw QR corner and the page number. The
 * numbers below are the single source for the hero proportion and the clamps
 * (the templates read them), so enlarging one breaks the fit test.
 */

/** Page height in cqw, derived from PAGE_RATIO ("210 / 297"). */
export const PAGE_HEIGHT = (() => {
  const [w, h] = PAGE_RATIO.split('/').map((n) => Number(n.trim()))
  return (100 * h!) / w!
})()

/** Inline equivalent of Tailwind's line-clamp-N, so the count has one source. */
export function clampStyle(lines: number): React.CSSProperties {
  return {
    display: '-webkit-box',
    WebkitLineClamp: lines,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  }
}

const textHeight = (size: number, lineHeight: number, lines: number) => size * lineHeight * lines

/** Rule: 0.65 tall with 2.6 above and below. */
const RULE = 0.65 + 2 * 2.6
/** Category line: 2.6cqw at leading 1.5. */
const CATEGORY = textHeight(2.6, 1.5, 1)
/** Contact block: address, hours (or amenities) and phone, 2.5cqw at leading 1.6; taller than the 11cqw QR. */
const CONTACT = Math.max(textHeight(2.5, 1.6, 3), 11)
/** The page number sits 2.6cqw from the bottom edge and is about 3.3cqw tall. */
const PAGE_NUMBER_ZONE = 2.6 + 3.3

export const A_LAYOUT = { heroPct: 42 }

/** Height of template A's text block (below the hero) at its worst input. */
export function templateAStack(): number {
  return (
    4.5 + // top padding
    CATEGORY +
    1.6 +
    textHeight(6.8, 1.1, 2) + // name, clamped to 2 lines
    1 +
    textHeight(3.2, 1.5, 2) + // tagline, clamped to 2 lines
    RULE +
    CONTACT + // contact row, QR beside it
    (PAGE_NUMBER_ZONE + 1.1) // bottom padding keeps the contact clear of the page number
  )
}
export function templateAAvailable(l = A_LAYOUT): number {
  return PAGE_HEIGHT * (1 - l.heroPct / 100)
}

export const B_LAYOUT = { photoHeight: 48, galleryHeight: 17 }

/** Template B: the whole page, top to bottom, at its worst input. */
export function templateBStack(l = B_LAYOUT): number {
  const head = 5 + CATEGORY + 1.8 + textHeight(7, 1.08, 2) + RULE
  // The main photo spans the row.
  const row = l.photoHeight
  const gallery = 3.2 + l.galleryHeight
  const foot = 3.2 + CONTACT + (PAGE_NUMBER_ZONE + 1.1)
  return head + row + gallery + foot
}

export const C_LAYOUT = { maxBandPct: 50 }

/** Template C: height of the bottom text band at its worst input. */
export function templateCBand(): number {
  return 4.5 + CATEGORY + 1.6 + textHeight(7.4, 1.05, 2) + RULE + CONTACT + (PAGE_NUMBER_ZONE + 0.7)
}
export function templateCBandLimit(l = C_LAYOUT): number {
  return (PAGE_HEIGHT * l.maxBandPct) / 100
}
