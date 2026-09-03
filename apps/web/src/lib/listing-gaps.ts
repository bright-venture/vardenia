import type { Payload } from 'payload'
import type { Business } from '../payload-types'
import { PLACEHOLDER_STEM } from './media'

/**
 * Every document matching a query, fetched a page at a time.
 *
 * # Why not `limit: 1000, pagination: false`, which is what this replaced
 *
 * Because that silently returns the first thousand and says nothing. Payload
 * applies `limit` even with pagination off, and then reports the truncated
 * count as the total - verified against production:
 *
 *   ?limit=5                    ->  5 docs, totalDocs=153
 *   ?limit=5&pagination=false   ->  5 docs, totalDocs=5     <-
 *   ?pagination=false           -> 153 docs, totalDocs=153
 *
 * So a caller cannot even detect the truncation from the response. On a
 * worklist that is the worst possible failure: it does not look broken, it
 * looks finished, and the listings past the cut are simply never worked.
 *
 * Dropping `limit` entirely would return everything and is what the third line
 * above does, but it trades a silent wrong answer for an unbounded read. This
 * pages instead: bounded per query, complete overall.
 *
 * # The ceiling throws rather than truncates
 *
 * Fifty thousand listings is far past the point where a report should be
 * fetching whole documents to count blank fields - that is a `GROUP BY`. If it
 * is ever reached, the run fails and says so, because the one thing this
 * function must never do again is quietly return part of the answer.
 */
const PAGE_SIZE = 500
const MAX_PAGES = 100

async function findEvery<T>(
  payload: Payload,
  args: Omit<Parameters<Payload['find']>[0], 'limit' | 'page' | 'pagination'>,
): Promise<T[]> {
  const all: T[] = []

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const result = await payload.find({ ...args, limit: PAGE_SIZE, page })
    all.push(...(result.docs as T[]))
    if (!result.hasNextPage) return all
  }

  throw new Error(
    `listing-gaps: stopped after ${MAX_PAGES * PAGE_SIZE} documents from ` +
      `"${String(args.collection)}". Rewrite this as an aggregate query rather ` +
      'than raising the ceiling.',
  )
}

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

/**
 * Every flag says what the listing HAS, never what it lacks.
 *
 * The first version named them `noPhotograph`, `noGallery` and so on, which put
 * "No photograph: no" in a spreadsheet cell - a double negative the reader has
 * to unpick on every row of three hundred, and exactly the sort of thing that
 * gets misread at speed into working on the listings that were already done.
 *
 * `missing` still counts what is absent, because that is what the file is
 * sorted by and "8 things missing" is the sentence somebody actually wants.
 */
export interface ListingGap {
  name: string
  slug: string
  status: string
  category: string
  governorate: string
  tier: string
  /** How many of the flags below are false. Sort on it, descending. */
  missing: number
  hasPhotograph: boolean
  hasGallery: boolean
  hasHours: boolean
  hasDescription: boolean
  hasTagline: boolean
  hasArabicName: boolean
  hasLocation: boolean
  bookingsOn: boolean
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
 * it needs one fact about it - whether it is still an import placeholder - which
 * is a set lookup against one extra query rather than 308 populated documents.
 * Populating them took longer than five minutes over a pooled connection when
 * the unpublish tool tried it.
 */
export async function listingGaps(payload: Payload): Promise<ListingGap[]> {
  /**
   * Every placeholder, not the first one.
   *
   * This started as `placeholderId(payload)` and a single id comparison, which
   * was wrong and quietly so: the development database holds several hundred
   * rows whose filename carries the placeholder stem, and a listing pointing at
   * any but the first was reported as having a real photograph. 305 of 314 rows
   * said "Photograph: yes" about the shared grey stand-in.
   *
   * Production happens to have exactly one today, which is why it looked fine
   * there - and is exactly the kind of thing that would start lying the first
   * time an import minted a second.
   *
   * The rest of the codebase tests the filename rather than the id, for this
   * reason. See PLACEHOLDER_STEM and isPlaceholder in lib/media.
   */
  const stand = await findEvery<{ id: number | string }>(payload, {
    collection: 'media',
    where: { filename: { like: PLACEHOLDER_STEM } },
    depth: 0,
    overrideAccess: true,
    select: { filename: true },
  })

  const placeholders = new Set(stand.map((doc) => String(doc.id)))

  const query = (locale: 'en' | 'ar') =>
    findEvery<Business>(payload, {
      collection: 'businesses',
      depth: 0,
      locale,
      overrideAccess: true,
      // Drafts included on purpose: a listing held back from this issue is
      // exactly the one somebody will be asked to finish for the next.
      draft: true,
    })

  const [english, arabic] = await Promise.all([query('en'), query('ar')])

  const arabicNames = new Map<string, string>()
  for (const doc of arabic) {
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

  const rows = english.map((doc) => {
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
      // A photograph of this place, so the shared stand-in does not count. Only
      // the placeholder case looks finished on the page, which is why it is the
      // one worth catching.
      hasPhotograph: Boolean(heroId) && !placeholders.has(heroId),
      hasGallery: count(doc.gallery) > 0,
      hasHours: count(doc.openingHours) > 0,
      hasDescription: !emptyRichText(doc.description),
      hasTagline: text(doc.tagline) !== '',
      hasArabicName: !isUntranslated(arabicNames.get(String(doc.id)), doc.name),
      // The map pin. Contact fields were dropped deliberately; see the
      // drop_contact_fields migration.
      hasLocation: Boolean(doc.location),
      bookingsOn: doc.booking?.enabled === true,
    }

    // Counted off the same flags the file prints, so the number and the columns
    // can never disagree - a mismatch there is the one thing that would make
    // somebody stop trusting the sort.
    gap.missing = [
      gap.hasPhotograph,
      gap.hasGallery,
      gap.hasHours,
      gap.hasDescription,
      gap.hasTagline,
      gap.hasArabicName,
      gap.hasLocation,
      gap.bookingsOn,
    ].filter((has) => !has).length

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
