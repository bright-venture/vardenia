import type { CategorySlug } from '@vardenia/core'
import { slugify } from '../fields/slug'

/**
 * Turns one spreadsheet row into something the Businesses collection accepts.
 *
 * # Why this is a pure function with no database in it
 *
 * Because the mapping is where the mistakes are, and mistakes in a mapping are
 * silent. A row that lands in the wrong category still saves, still gets a QR
 * code, and still prints. Keeping the decisions here means the whole file can be
 * mapped and checked in milliseconds without a database anywhere near it.
 *
 * run.ts does nothing but call this and save.
 *
 * # It only fills fields the collection already had
 *
 * Nothing here invents a field. A spreadsheet always carries more than the site
 * models - this one has phone numbers, Instagram handles, founders and quoted
 * reviews - and the temptation is to add a column for each. That is how an
 * import ends up dictating the shape of the product.
 *
 * So the columns without a home are left in the spreadsheet. Reviews and Founder
 * would be somebody else's words published as ours, and contact details are a
 * decision about what a listing page is for, not a decision an importer gets to
 * make.
 *
 * # Everything questionable becomes a warning, not an exception
 *
 * A single unmappable row must not stop an import of hundreds. Warnings are
 * counted and reported, so a run is auditable rather than either silent or
 * aborted. `null` fields are left for a person to fill in later; a guess would
 * be indistinguishable from real data once it is in the database.
 */

export interface ImportedListing {
  /** The spreadsheet's own ID column, kept so a row can be traced back. */
  sourceId: string
  name: string
  slug: string
  category: CategorySlug
  subcategories: string[]
  governorate: string
  district: string | null
  /** The Location column, kept verbatim - it is a place name, not a street. */
  address: string | null
  googleRating: number | null
  priceRange: string | null
  tagline: string | null
  description: string | null
  /** From "Type / Activity", which is written as a list already. */
  tags: string[]
  /** year-round, summer, winter. Empty when the sheet names no season. */
  seasonality: string[]
  /** Anything a person should look at. Never fatal. */
  warnings: string[]
}

/**
 * Category and subcategory per sheet heading.
 *
 * `tour-guides` and `festivals` were added to the taxonomy for this import.
 * Squashing 29 listings into `adventure` would have made the section filters
 * describe something they do not contain, and a filter that lies is worse than
 * a category that is new.
 */
const CATEGORY_BY_HEADING: Record<string, { category: CategorySlug; subcategory: string }> = {
  Hotels: { category: 'hospitality', subcategory: 'luxury-hotels' },
  'Guest Houses': { category: 'hospitality', subcategory: 'guest-houses' },
  Restaurants: { category: 'food-and-beverage', subcategory: 'restaurants' },
  Activities: { category: 'tourism', subcategory: 'adventure' },
  'Tour Guides': { category: 'tourism', subcategory: 'tour-guides' },
  Festivals: { category: 'tourism', subcategory: 'festivals' },
}

/** Both districts in this file are Mount Lebanon; nothing else appears. */
const DISTRICT_BY_HEADING: Record<string, string> = {
  'Keserwan District': 'keserwan',
  'Byblos / Jbeil District': 'jbeil',
  // Six rows span both. Keserwan wins because the directory is a Keserwan one,
  // and the row is flagged so a person can split it later if it matters.
  'Keserwan + Byblos / Jbeil Districts': 'keserwan',
}

const GOVERNORATE = 'mount-lebanon'

/**
 * Strips what the spreadsheet put in the name field that is not a name.
 *
 * 22 names carry a star rating, and many carry an em-dashed location that
 * duplicates the Location column. Both would appear on the printed page and in
 * the URL: `oakridge-mountain-resort-5-star-hotel` is not a slug anybody wants
 * on a QR destination that cannot be reprinted.
 */
export function cleanName(raw: string, location?: string): string {
  return cleanNameWithNote(raw, location).name
}

export interface CleanedName {
  name: string
  /**
   * Set when the name ends in a place that is not the Location column.
   *
   * Not a parsing failure - a disagreement in the source. Four rows carry a
   * town in the name that contradicts their own Location cell: "Four Season
   * Halat - Halat" is filed under Kaslik, and "Halat Sur Mer - Halat" under
   * Ghazir. Guessing which is right would put a listing in the wrong town on a
   * page that a printed code points at, so both are kept and a person decides.
   */
  disagreement: string | null
}

/**
 * Strips what the spreadsheet put in the name that is not a name, and says so
 * when it declined to.
 */
export function cleanNameWithNote(raw: string, location?: string): CleanedName {
  let name = raw
    .replace(/[★☆]+/gu, ' ')
    .replace(/\(\s*\d\s*-?\s*star[^)]*\)/gi, ' ')
    .trim()

  let disagreement: string | null = null

  /**
   * Trailing " - Somewhere" only when it repeats the Location column. Removing
   * every trailing dash phrase would eat real names: "Casa Dunia Guesthouse -
   * Hosting Lebanon" is the business's actual name, not a place.
   */
  if (location) {
    const place = location.trim().toLowerCase()
    const match = name.match(/^(.*?)\s*[-–—]\s*(.+)$/u)
    const trailing = match?.[2]?.trim().toLowerCase()

    if (match?.[1] && trailing) {
      if (trailing === place || place.includes(trailing)) {
        name = match[1].trim()
      } else if (trailing.split(/[\s,]+/).length <= 2 && !/\d/.test(trailing)) {
        // Short, wordy and not a match: most likely a place name that the
        // Location column contradicts. Reported, never resolved here.
        disagreement = `name ends in "${match[2]!.trim()}" but the location column says "${location.trim()}"`
      }
    }
  }

  return {
    name: name
      .replace(/\s{2,}/g, ' ')
      .replace(/[\s,;-]+$/u, '')
      .trim(),
    disagreement,
  }
}

/**
 * The "Type / Activity" column as tags.
 *
 * 70 rows carry one, and they are already written as lists: "Bowling, billiards,
 * darts & games", "Skiing, snowboarding, hiking & summer mountain activities".
 * Splitting on the separators the sheet uses turns one cell into the several
 * things it was always describing, which is what the `tags` field is for.
 *
 * A slash splits too, because guides are written as "Paragliding / Adventure
 * Guide". That does mean "Cable-car ride" stays whole and "Private Tour /
 * Adventure Guide" becomes two, which is the right answer in both cases.
 */
export function tagsFrom(raw: string): string[] {
  const parts = raw
    .split(/[,/&]|\band\b/gi)
    .map((part) => part.replace(/\.$/, '').trim())
    .filter((part) => part.length > 2 && part.length <= 60)

  // Case-insensitively unique, keeping the first spelling seen.
  const seen = new Set<string>()
  const tags: string[] = []

  for (const part of parts) {
    const key = part.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    tags.push(part)
  }

  return tags.slice(0, 8)
}

/**
 * "Usually When" into the seasonality the collection offers.
 *
 * Only twelve rows have one, all festivals, written as months: "July-August",
 * "August 14-15", "Summer, commonly July-August".
 *
 * The field offers year-round, summer and winter and nothing else, so
 * "September-October" gets no value rather than being rounded into summer. An
 * autumn festival labelled summer is a wrong answer on a page; no label is
 * merely an incomplete one.
 */
export function seasonalityFrom(raw: string): string[] {
  const text = raw.toLowerCase()
  if (!text.trim()) return []

  if (/year[\s-]?round|all year/.test(text)) return ['year-round']

  const summer = /summer|june|july|august/.test(text)
  const winter = /winter|december|january|february|ski/.test(text)

  const seasons: string[] = []
  if (summer) seasons.push('summer')
  if (winter) seasons.push('winter')

  return seasons
}

/**
 * A dollar figure into one of the four bands.
 *
 * The lower bound is used, because "$120 - $300+" describes a place you can
 * stay in for 120. Thresholds are for accommodation, which is what almost every
 * priced row in this file is; a restaurant priced in this file is rare enough
 * that a person can correct it.
 */
export function priceBand(raw: string): string | null {
  const match = raw.match(/\$\s*([\d,]+)/)
  const amount = match?.[1] ? Number(match[1].replace(/,/g, '')) : NaN
  if (!Number.isFinite(amount)) return null

  if (amount < 50) return '1'
  if (amount < 150) return '2'
  if (amount < 300) return '3'
  return '4'
}

/** `Rating: 4.6/5` and friends, clamped to what the field accepts. */
export function parseRating(raw: string): number | null {
  const match = raw.match(/(\d+(?:\.\d+)?)/)
  const value = match?.[1] ? Number(match[1]) : NaN
  if (!Number.isFinite(value) || value < 0 || value > 5) return null
  return value
}

/**
 * The tagline the site shows under a name.
 *
 * Taken from the first clause of the description, because the field is capped
 * at 120 characters and the descriptions here start with exactly that kind of
 * phrase: "5-star mountain resort | Luxury rooms and suites, spa...".
 */
function taglineFrom(description: string, type: string): string | null {
  const source = description.split('|')[0]?.trim() || type.trim()
  if (!source) return null
  return source.length <= 120 ? source : `${source.slice(0, 117).trimEnd()}...`
}

const value = (row: Record<string, string>, key: string): string => (row[key] ?? '').trim()

/**
 * One row in, one listing out.
 *
 * `takenSlugs` is mutated so a run over the whole file cannot produce two
 * listings with the same slug. The file has one genuine duplicate name, Murray
 * Resto, and the slug field is unique, so without this the second save fails
 * partway through the import.
 */
export function toListing(
  row: Record<string, string>,
  takenSlugs: Set<string> = new Set(),
): ImportedListing | null {
  const warnings: string[] = []

  const heading = value(row, 'Category')
  const mapping = CATEGORY_BY_HEADING[heading]

  if (!mapping) {
    // The only unrecoverable case: with no category the listing cannot be saved
    // at all, and inventing one would put it in a section it does not belong in.
    return null
  }

  const location = value(row, 'Location')
  const { name, disagreement } = cleanNameWithNote(value(row, 'Name / Listing'), location)

  if (!name) return null
  if (disagreement) warnings.push(disagreement)

  const districtHeading = value(row, 'District')
  const district = DISTRICT_BY_HEADING[districtHeading] ?? null

  if (!district) {
    warnings.push(
      districtHeading
        ? `district "${districtHeading}" is not one we know, left blank`
        : 'no district given, left blank',
    )
  } else if (districtHeading.includes('+')) {
    warnings.push('spans two districts, filed under Keserwan')
  }

  const stars = Number(value(row, 'Hotel Stars'))
  const subcategory =
    heading === 'Hotels' && Number.isFinite(stars) && stars > 0 && stars < 4
      ? 'boutique-hotels'
      : mapping.subcategory

  /** Unique from the start, because the slug column refuses a duplicate. */
  let slug = slugify(name)
  if (!slug) return null

  if (takenSlugs.has(slug)) {
    let suffix = 2
    while (takenSlugs.has(`${slug}-${suffix}`)) suffix += 1
    warnings.push(`slug "${slug}" was taken, used "${slug}-${suffix}"`)
    slug = `${slug}-${suffix}`
  }
  takenSlugs.add(slug)

  const description = value(row, 'Overview / Description')
  const activity = value(row, 'Type / Activity')

  const when = value(row, 'Usually When')
  const seasonality = seasonalityFrom(when)

  if (when && seasonality.length === 0) {
    // "September-October" is the real case. The field has no autumn, and
    // rounding it into summer would put a wrong season on a festival page.
    warnings.push(`"${when}" is not a season the site offers, left blank`)
  }

  return {
    sourceId: value(row, 'ID'),
    name,
    slug,
    category: mapping.category,
    subcategories: [subcategory],
    governorate: GOVERNORATE,
    district,
    address: location || null,
    googleRating: parseRating(value(row, 'Rating / 5')),
    priceRange: priceBand(value(row, 'Price Range')),
    tagline: taglineFrom(description, activity),
    description: description || null,
    tags: tagsFrom(activity),
    seasonality,
    warnings,
  }
}

export interface MappedRows {
  listings: ImportedListing[]
  /** Rows that could not become a listing at all, with the reason. */
  skipped: { sourceId: string; name: string; reason: string }[]
}

/** The whole file, with slugs deduplicated across it. */
export function toListings(rows: Record<string, string>[]): MappedRows {
  const takenSlugs = new Set<string>()
  const listings: ImportedListing[] = []
  const skipped: MappedRows['skipped'] = []

  for (const row of rows) {
    const listing = toListing(row, takenSlugs)

    if (listing) {
      listings.push(listing)
      continue
    }

    skipped.push({
      sourceId: value(row, 'ID'),
      name: value(row, 'Name / Listing'),
      reason: CATEGORY_BY_HEADING[value(row, 'Category')]
        ? 'no usable name'
        : `unknown category "${value(row, 'Category')}"`,
    })
  }

  return { listings, skipped }
}
