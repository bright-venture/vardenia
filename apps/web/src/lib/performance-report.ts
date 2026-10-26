import type { Payload } from 'payload'
import { isPeriod, periodBounds, previousPeriod } from '@vardenia/core'
import { beirutInstant } from './beirut'
import { rawDb } from './db'
import { listingGaps } from './listing-gaps'

/**
 * One month of each business's results, and what to do about the weak ones.
 *
 * For the team first (see app/reports/performance): QR scans and where they
 * came from, booking requests and what became of them, the guests who
 * confirmed they came, no-shows, disputed visits and how fast the venue
 * answers. Each business is then checked against simple rules, which give the
 * flags that put it on the "needs attention" list and the practical
 * suggestions printed on its own report.
 *
 * The data is read in a handful of aggregate queries, never row by row, for
 * the same reason as lib/scan-report: it has to keep working when the product
 * succeeds. The rules are pure functions below the queries, so they are tested
 * without a database.
 */

// ---------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------

export interface ScanPlace {
  city: string | null
  country: string | null
  scans: number
}

export interface BusinessPerformance {
  id: number
  name: string
  slug: string
  governorate: string | null
  district: string | null
  category: string | null
  tier: string
  featured: boolean
  bookingsOn: boolean
  hasPartner: boolean
  hasCode: boolean

  /** QR scans in the month, and in the month before. */
  scans: number
  scansBefore: number
  /** Where this month's scans came from, most first. City is empty until the CDN sends it. */
  places: ScanPlace[]

  /** Booking requests for visits in the month, by what became of them. */
  requests: number
  pending: number
  confirmed: number
  completed: number
  noShows: number
  cancelled: number
  /** Guests who answered "I came" / "I did not come". */
  came: number
  absent: number
  /** Visits where the guest and the venue disagree and the team has not decided. */
  disputes: number
  /** People who came, as far as billing is concerned. */
  guests: number
  /** Median hours the venue took to answer a request, or null with no answers. */
  answerHours: number | null

  /** What the listing page is missing. */
  missing: ListingMissing

  flags: Flag[]
  suggestions: Suggestion[]
}

export interface ListingMissing {
  photograph: boolean
  hours: boolean
  description: boolean
  arabicName: boolean
  location: boolean
}

export type Flag =
  | 'disputes'
  | 'no-shows'
  | 'low-scans'
  | 'falling-scans'
  | 'looked-not-booked'
  | 'slow-answers'
  | 'incomplete-page'

export const FLAG_LABELS: Record<Flag, string> = {
  disputes: 'Disputed visits',
  'no-shows': 'Many no-shows',
  'low-scans': 'Few scans',
  'falling-scans': 'Scans falling',
  'looked-not-booked': 'Scanned, not booked',
  'slow-answers': 'Slow to answer',
  'incomplete-page': 'Page incomplete',
}

export interface Suggestion {
  text: string
  /** For the team only, never printed on the business's own report. */
  forTeam: boolean
}

export interface PerformanceReport {
  period: string
  periodBefore: string
  businesses: BusinessPerformance[]
  totals: {
    scans: number
    requests: number
    came: number
    noShows: number
    disputes: number
    noShowRate: number | null
    medianScans: number
  }
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

/** A no-show rate this high, over at least this many finished visits, is an outlier. */
export const NO_SHOW_FLOOR = 0.25
export const NO_SHOW_MIN_VISITS = 5
/** Below this share of the median listing's scans counts as few. */
export const LOW_SCAN_SHARE = 0.25
/** A month at half the one before, from at least this many, counts as falling. */
export const FALLING_FROM = 10
/** Enough scans to say people are looking. */
export const LOOKING_SCANS = 10
/** Slower than this, in hours, is slow. */
export const SLOW_ANSWER_HOURS = 12

export interface RuleContext {
  medianScans: number
  /** No-show rate across all businesses, or null with no finished visits. */
  overallNoShowRate: number | null
}

type Facts = Omit<BusinessPerformance, 'flags' | 'suggestions'>

/** Finished visits: the ones that could have been a no-show. */
const finished = (b: Facts) => b.completed + b.noShows

export function noShowRate(b: Pick<Facts, 'completed' | 'noShows'>): number | null {
  const total = b.completed + b.noShows
  return total === 0 ? null : b.noShows / total
}

/** The flags one business earns this month. */
export function flagsFor(b: Facts, context: RuleContext): Flag[] {
  const flags: Flag[] = []
  if (b.disputes > 0) flags.push('disputes')

  const rate = noShowRate(b)
  const outlierRate = Math.max(NO_SHOW_FLOOR, 2 * (context.overallNoShowRate ?? 0))
  if (rate !== null && finished(b) >= NO_SHOW_MIN_VISITS && rate >= outlierRate)
    flags.push('no-shows')

  if (b.hasCode && context.medianScans > 0 && b.scans < context.medianScans * LOW_SCAN_SHARE) {
    flags.push('low-scans')
  }
  if (b.scansBefore >= FALLING_FROM && b.scans < b.scansBefore / 2) flags.push('falling-scans')
  if (b.scans >= LOOKING_SCANS && b.requests === 0) flags.push('looked-not-booked')
  if (b.answerHours !== null && b.answerHours > SLOW_ANSWER_HOURS) flags.push('slow-answers')
  if (b.missing.photograph || b.missing.hours || b.missing.description)
    flags.push('incomplete-page')
  return flags
}

/**
 * Practical things to do, from the flags and the gaps. Worded for the business
 * unless marked for the team, because the business's report prints them.
 */
export function suggestionsFor(b: Facts, flags: Flag[]): Suggestion[] {
  const out: Suggestion[] = []
  const add = (text: string, forTeam = false) => out.push({ text, forTeam })

  if (flags.includes('low-scans') || flags.includes('falling-scans')) {
    add(
      'Put the Vardenia QR sticker where guests wait or pay: the entrance, the tables, the bill folder. A code people do not see is not scanned.',
    )
    add('Share your Vardenia page on Instagram and WhatsApp Status, with the link in your bio.')
    add('Ask your team to mention the Vardenia passport: guests scan to collect a stamp.')
  }
  if (flags.includes('falling-scans')) {
    add(
      `Scans fell from ${b.scansBefore} to ${b.scans}. Check the sticker is still in place and visible.`,
    )
  }
  if (flags.includes('looked-not-booked')) {
    add(
      b.bookingsOn
        ? 'Many guests open your page but few book. Check your opening hours, closed dates and party sizes are right, so requests are not refused.'
        : 'Guests open your page but cannot book: switch on table bookings through Vardenia.',
    )
  }
  if (flags.includes('slow-answers')) {
    add(
      `You take about ${b.answerHours} hours to answer a request. Answer within the hour, or switch on automatic confirmation, so guests do not book elsewhere.`,
    )
  }
  if (flags.includes('no-shows')) {
    add('Many guests booked and did not come. Confirm larger tables by WhatsApp the day before.')
    add('Arrange a mystery visit to check this venue marks visits honestly.', true)
  }
  if (flags.includes('disputes')) {
    add(
      `Settle ${b.disputes} disputed visit${b.disputes === 1 ? '' : 's'} (the guest and the venue disagree) from the bookings list.`,
      true,
    )
  }
  if (b.missing.photograph)
    add('Send us your own photographs: the page shows a stand-in picture today.')
  if (b.missing.hours) add('Add your opening hours, so guests know when to come.')
  if (b.missing.description) add('Add a short description of what makes the place worth the trip.')
  if (b.missing.arabicName) add('Give us your name in Arabic, for Arabic readers.')
  if (b.missing.location) add('Send us your exact location, so the map and directions work.')
  if ((flags.includes('low-scans') || flags.includes('looked-not-booked')) && !b.featured) {
    add('Offer Featured for a month: a place on the home page and first in every list.', true)
  }
  return out
}

const median = (values: number[]): number => {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

/** Applies the rules across every business, which needs the whole month for the medians. */
export function assess(facts: Facts[]): {
  businesses: BusinessPerformance[]
  context: RuleContext
} {
  const finishedAll = facts.reduce((s, b) => s + finished(b), 0)
  const context: RuleContext = {
    medianScans: median(facts.filter((b) => b.hasCode).map((b) => b.scans)),
    overallNoShowRate: finishedAll ? facts.reduce((s, b) => s + b.noShows, 0) / finishedAll : null,
  }
  const businesses = facts.map((b) => {
    const flags = flagsFor(b, context)
    return { ...b, flags, suggestions: suggestionsFor(b, flags) }
  })
  return { businesses, context }
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v ?? 0) || 0)
const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null)

/** The month a report covers: the one asked for, or the current one. */
export function reportPeriod(raw: string | null, now: Date = new Date()): string {
  return raw && isPeriod(raw) ? raw : now.toISOString().slice(0, 7)
}

export async function performanceReport(
  payload: Payload,
  period: string,
): Promise<PerformanceReport> {
  const { pool, schema } = rawDb(payload)
  const q = async (sql: string, values: unknown[] = []) =>
    (await pool.query(sql.replaceAll('{schema}', `"${schema}"`), values)).rows as Record<
      string,
      unknown
    >[]

  const before = previousPeriod(`${period}-01`)
  // Midnight in Beirut, as the statements count a month.
  const midnight = (day: string) => beirutInstant(day, '00:00') ?? new Date(`${day}T00:00:00Z`)
  const from = midnight(periodBounds(period).first)
  const to = midnight(periodBounds(period).next)
  const fromBefore = midnight(periodBounds(before).first)

  const [listings, scans, places, bookings, gaps] = await Promise.all([
    q(`
      select b.id, b.slug, b.governorate, b.district, b.category, b.tier, b.featured,
             b.booking_enabled, b.qr_code_id,
             (select name from {schema}.businesses_locales where _parent_id = b.id and _locale = 'en') as name,
             exists (select 1 from {schema}.business_users_rels r where r.businesses_id = b.id) as has_partner
      from {schema}.businesses b
      where b._status = 'published'`),
    q(
      `select business_id as id,
              count(*) filter (where scanned_at >= $1 and scanned_at < $2)::int as cur,
              count(*) filter (where scanned_at >= $3 and scanned_at < $1)::int as prev
       from {schema}.scan_events
       where business_id is not null and scanned_at >= $3 and scanned_at < $2
       group by business_id`,
      [from, to, fromBefore],
    ),
    q(
      `select business_id as id, city, country, count(*)::int as n
       from {schema}.scan_events
       where business_id is not null and scanned_at >= $1 and scanned_at < $2
       group by business_id, city, country
       order by n desc`,
      [from, to],
    ),
    q(
      `select business_id as id,
              count(*)::int as requests,
              count(*) filter (where status = 'pending')::int as pending,
              count(*) filter (where status = 'confirmed')::int as confirmed,
              count(*) filter (where status = 'completed')::int as completed,
              count(*) filter (where status = 'no-show')::int as no_shows,
              count(*) filter (where status = 'cancelled')::int as cancelled,
              count(*) filter (where guest_answer = 'came')::int as came,
              count(*) filter (where guest_answer = 'did-not-come')::int as absent,
              count(*) filter (where attendance_verdict is null and (
                (guest_answer = 'came' and status in ('no-show', 'cancelled')) or
                (guest_answer = 'did-not-come' and status = 'completed')))::int as disputes,
              coalesce(sum(party_size) filter (where attendance_verdict = 'guest' and guest_answer = 'came'
                or (attendance_verdict is distinct from 'guest' and (status = 'completed'
                    or (status = 'confirmed' and "end" < now() - interval '7 days')))), 0)::int as guests,
              percentile_cont(0.5) within group (order by extract(epoch from (answered_at - created_at)) / 3600)
                filter (where answered_at is not null and answered_at >= created_at) as answer_hours
       from {schema}.bookings
       where "start" >= $1 and "start" < $2
       group by business_id`,
      [from, to],
    ),
    listingGaps(payload),
  ])

  const scanBy = new Map(scans.map((r) => [num(r.id), r]))
  const bookingBy = new Map(bookings.map((r) => [num(r.id), r]))
  const placesBy = new Map<number, ScanPlace[]>()
  for (const r of places) {
    const id = num(r.id)
    const list = placesBy.get(id) ?? []
    if (list.length < 8) list.push({ city: str(r.city), country: str(r.country), scans: num(r.n) })
    placesBy.set(id, list)
  }
  const gapBy = new Map(gaps.map((g) => [g.slug, g]))

  const facts: Facts[] = listings.map((l) => {
    const id = num(l.id)
    const s = scanBy.get(id)
    const b = bookingBy.get(id)
    const gap = gapBy.get(String(l.slug))
    const hours = b?.answer_hours == null ? null : Math.max(1, Math.round(num(b.answer_hours)))
    return {
      id,
      name: str(l.name) ?? String(l.slug),
      slug: String(l.slug),
      governorate: str(l.governorate),
      district: str(l.district),
      category: str(l.category),
      tier: String(l.tier ?? ''),
      featured: l.featured === true,
      bookingsOn: l.booking_enabled === true,
      hasPartner: l.has_partner === true,
      hasCode: l.qr_code_id != null,
      scans: num(s?.cur),
      scansBefore: num(s?.prev),
      places: placesBy.get(id) ?? [],
      requests: num(b?.requests),
      pending: num(b?.pending),
      confirmed: num(b?.confirmed),
      completed: num(b?.completed),
      noShows: num(b?.no_shows),
      cancelled: num(b?.cancelled),
      came: num(b?.came),
      absent: num(b?.absent),
      disputes: num(b?.disputes),
      guests: num(b?.guests),
      answerHours: hours,
      missing: {
        photograph: gap ? !gap.hasPhotograph : false,
        hours: gap ? !gap.hasHours : false,
        description: gap ? !gap.hasDescription : false,
        arabicName: gap ? !gap.hasArabicName : false,
        location: gap ? !gap.hasLocation : false,
      },
    }
  })

  const { businesses, context } = assess(facts)
  const sum = (key: keyof Facts) => businesses.reduce((s, b) => s + num(b[key]), 0)
  return {
    period,
    periodBefore: before,
    businesses,
    totals: {
      scans: sum('scans'),
      requests: sum('requests'),
      came: sum('came'),
      noShows: sum('noShows'),
      disputes: sum('disputes'),
      noShowRate: context.overallNoShowRate,
      medianScans: context.medianScans,
    },
  }
}
