import type { Payload } from 'payload'
import { placeholderId } from '../import/run'

/**
 * What is still missing from every listing, as a worklist.
 *
 * # Why this exists
 *
 * The directory went live with 153 listings and almost nothing on them. Measured
 * the day it shipped: 153 had no gallery, 152 had no opening hours, 118 had no
 * English description and 153 had no Arabic name at all - on a bilingual site
 * where `/ar/directory` was already public.
 *
 * None of that is a bug. It is data entry nobody had a list for, and a listing
 * with a photograph and no hours looks finished from the outside, so the gaps do
 * not announce themselves. This is the list.
 *
 * # Staff, not partners
 *
 * Vardenia writes what a place is - that is the promise on the home page and the
 * reason a business never edits its own listing. So this is a report for the
 * team, not a panel on the partner dashboard: a partner is not being asked to
 * send us their opening hours, we are being told which ones we still owe.
 *
 * # A count, so it sorts
 *
 * `missing` is what makes the file usable. Open it, sort by that column, and the
 * emptiest listings are at the top - which is where somebody with an afternoon
 * should start. Every other column is yes or no so the filters in a spreadsheet
 * do the rest.
 */

export interface ListingGap {
  name: string
  slug: string
  status: string
  category: string
  governorate: string
  tier: string
  /** How many of the checks below this listing fails. Sort on it. */
  missing: number
  noPhotograph: boolean
  noGallery: boolean
  noHours: boolean
  noDescription: boolean
  noTagline: boolean
  noArabicName: boolean
  noLocation: boolean
  bookingsOff: boolean
}

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

/**
 * A rich-text field is empty when it has no text in it, which is not the same as
 * being null.
 *
 * Lexical stores a document even when the editor was opened and closed, so a
 * description nobody typed is `{root:{children:[{children:[]}]}}` rather than
 * absent. Serialising and looking for any letter is crude and correct; asking
 * the editor to walk its own tree would mean importing it, and this runs in a
 * report.
 */
const emptyRichText = (value: unknown): boolean => {
  if (!value) return true
  return !/[\p{L}\p{N}]/u.test(JSON.stringify(value))
}

const count = (value: unknown): number => (Array.isArray(value) ? value.length : 0)

/**
 * Whether the Arabic value is really Arabic, or the English one falling through.
 *
 * Blank means nothing was written. Identical to the English means nothing was
 * written either - Payload serves the default locale when a localised field is
 * unset, which is right for a page and wrong for a report about what is unset.
 * Containing no Arabic letters at all is the third case: somebody typed the
 * Latin name into the Arabic field, which is not a translation.
 */
export function isUntranslated(arabic: string | undefined, english: string): boolean {
  const value = (arabic ?? '').trim()
  if (!value) return true
  if (value === english.trim()) return true
  return !/[؀-ۿ]/.test(value)
}

/**
 * One pass over every listing, in both languages.
 *
 * Two queries rather than `locale: 'all'`, because the merged shape it returns
 * puts every localised field behind an extra object and every read below would
 * have to branch on it. Two flat passes and a map by id is the same data and
 * reads like the thing it is.
 *
 * `depth: 0` throughout. The only relationship this needs is the hero image, and
 * it needs one fact about it - whether it is still the shared import placeholder
 * - which is one id comparison rather than 308 populated documents. Populating
 * them took longer than five minutes over a pooled connection when the unpublish
 * tool tried it.
 */
export async function listingGaps(payload: Payload): Promise<ListingGap[]> {
  const placeholder = String(await placeholderId(payload))

  const query = (locale: 'en' | 'ar') =>
    payload.find({
      collection: 'businesses',
      limit: 1000,
      pagination: false,
      depth: 0,
      locale,
      overrideAccess: true,
      // Drafts included on purpose: a listing held back from this issue is
      // exactly the one somebody will be asked to finish for the next.
      draft: true,
    })

  const [english, arabic] = await Promise.all([query('en'), query('ar')])

  const arabicNames = new Map<string, string>()
  for (const doc of arabic.docs) {
    /**
     * Payload falls back to the default locale for an unset localised field, so
     * an Arabic name that was never written comes back as the English one. That
     * is the right behaviour for a page - better English than blank - and the
     * wrong answer for this report, which would say every listing is done.
     *
     * Compared against the English value instead: identical means nothing was
     * translated. It misses the handful of names that are genuinely the same in
     * both, which is a small undercount in the safe direction - somebody checks
     * a listing that turns out to be fine.
     */
    arabicNames.set(String(doc.id), text(doc.name))
  }

  const rows = english.docs.map((doc) => {
    /**
     * The generated `Business` type rather than `Record<string, unknown>`.
     *
     * A cast to a loose record would have compiled with `doc.openningHours` in
     * it and reported every listing as missing its hours - the exact class of
     * silent wrong answer lib/qr-doc was written to stop. Here it matters twice
     * over, because nobody checks a worklist against the truth; they work it.
     */
    const hero = doc.heroImage
    const heroId = typeof hero === 'object' && hero ? String(hero.id) : String(hero ?? '')

    const gap: ListingGap = {
      name: text(doc.name),
      slug: text(doc.slug),
      status: doc._status ?? 'published',
      category: text(doc.category),
      governorate: text(doc.governorate),
      tier: text(doc.tier),
      missing: 0,
      // Absent or still the shared stand-in. Both mean "no photograph of this
      // place", and only the second one looks fine on the page.
      noPhotograph: !heroId || heroId === placeholder,
      noGallery: count(doc.gallery) === 0,
      noHours: count(doc.openingHours) === 0,
      noDescription: emptyRichText(doc.description),
      noTagline: text(doc.tagline) === '',
      noArabicName: isUntranslated(arabicNames.get(String(doc.id)), doc.name),
      // The map pin. Contact fields were dropped deliberately; see the
      // drop_contact_fields migration.
      noLocation: !doc.location,
      bookingsOff: doc.booking?.enabled !== true,
    }

    gap.missing = [
      gap.noPhotograph,
      gap.noGallery,
      gap.noHours,
      gap.noDescription,
      gap.noTagline,
      gap.noArabicName,
      gap.noLocation,
      gap.bookingsOff,
    ].filter(Boolean).length

    return gap
  })

  /**
   * Emptiest first, and published before drafts within that.
   *
   * The file is opened to answer "what should someone do this afternoon", and
   * the answer is never a draft nobody has decided to publish yet.
   */
  return rows.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'published' ? -1 : 1
    if (b.missing !== a.missing) return b.missing - a.missing
    return a.name.localeCompare(b.name)
  })
}
