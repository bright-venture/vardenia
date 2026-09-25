import type { Payload, TypedUser } from 'payload'
import { LISTING_TIERS, can, tierOf } from '@vardenia/core'
import { TIER_LABELS } from '../fields/tier'
import { beirutDate, beirutInstant } from './beirut'
import { dashboardCounts } from './dashboard-stats'
import { emailWarning } from './email'
import { comingSoonConfig } from './coming-soon'
import { indexingNotice } from './indexing'

/**
 * What the admin home page shows: a handful of numbers, and a to-do list
 * grouped by area.
 *
 * Everything on the list is there because somebody has to act on it, and each
 * item says what to do, not only what is wrong. An area with nothing in it does
 * not appear, so an empty list means there is genuinely nothing to do.
 *
 * Queries run with `overrideAccess: false` and the signed-in user, so the same
 * field rules apply here as anywhere else. Contract dates reach this page
 * because the reader is staff, not because the home page is special.
 */

const DAY = 86_400_000

/** Contracts inside this window are worth chasing now. */
const EXPIRING_SOON_DAYS = 30

/** How far back the scan figure looks. */
export const SCAN_WINDOW_DAYS = 30

/** A statement unpaid this long after it was sent: the booking button may go off. */
const SWITCH_OFF_DAYS = 30

/** The tiers that get a QR code, so a missing one is a fault rather than the design. */
const TIERS_WITH_CODES = LISTING_TIERS.filter((tier) => can(tier, 'qrCode'))

export type AttentionArea = 'Site setup' | 'Booking fees' | 'Listings' | 'Reviews'

export interface AttentionItem {
  area: AttentionArea
  title: string
  /** What is wrong and what to do about it, in one sentence. */
  detail: string
  /**
   * Optional, because not everything needing attention is a document. A
   * configuration problem is fixed in the hosting dashboard, and inventing a
   * destination would be worse than not linking.
   */
  href?: string
  /** `info` is a note, not a task: grey, and not counted in the to-do total. */
  tone: 'info' | 'warn' | 'error'
}

export interface AdminHome {
  numbers: {
    listingsLive: number
    listingDrafts: number
    bookingsThisMonth: number
    scans: number
    feesOwed: number
  }
  attention: AttentionItem[]
}

/** Dates only. A contract does not end at a time of day. */
export function formatDate(value?: string | Date | null): string {
  if (!value) return 'an unknown date'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'an unknown date'
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

/**
 * What an overdue statement asks of the team, which changes once it has been
 * unpaid for thirty days since it was sent.
 */
export function overdueDetail(dueAt: string | undefined, sentAt: string | undefined, now: Date) {
  const unpaidSince = `Unpaid since ${formatDate(dueAt)}.`
  const sent = sentAt ? new Date(sentAt).getTime() : NaN
  if (!Number.isFinite(sent)) return `${unpaidSince} Contact the venue.`
  const switchOff = new Date(sent + SWITCH_OFF_DAYS * DAY)
  return switchOff.getTime() <= now.getTime()
    ? `${unpaidSince} More than ${SWITCH_OFF_DAYS} days since it was sent: the venue's booking button can be switched off.`
    : `${unpaidSince} Contact the venue. The booking button can be switched off from ${formatDate(switchOff)}.`
}

export async function adminHome(
  payload: Payload,
  user: TypedUser,
  now = new Date(),
): Promise<AdminHome> {
  const soon = new Date(now.getTime() + EXPIRING_SOON_DAYS * DAY)
  const windowStart = new Date(now.getTime() - SCAN_WINDOW_DAYS * DAY)
  const today = beirutDate(now)
  const monthStart = beirutInstant(`${today.slice(0, 8)}01`, '00:00') ?? now

  const opts = { depth: 0, limit: 5, overrideAccess: false, user } as const

  const [counts, bookings, owed, expired, expiring, codeless, disputed, overdue, drafts, reviews] =
    await Promise.all([
      dashboardCounts(payload, windowStart),
      payload.count({
        collection: 'bookings',
        where: {
          and: [
            { start: { greater_than_equal: monthStart.toISOString() } },
            { status: { in: ['pending', 'confirmed', 'completed'] } },
          ],
        },
        overrideAccess: false,
        user,
      }),
      payload.find({
        ...opts,
        limit: 500,
        collection: 'statements',
        where: { status: { equals: 'sent' } },
        select: { total: true },
      }),

      // Lapsed, and still on its tier. Nothing expires on its own (see
      // packages/core/src/tiers.ts), so this is the only thing that notices.
      payload.find({
        ...opts,
        collection: 'businesses',
        where: { contractEndsAt: { less_than: now.toISOString() } },
        sort: 'contractEndsAt',
      }),
      payload.find({
        ...opts,
        collection: 'businesses',
        where: {
          and: [
            { contractEndsAt: { greater_than_equal: now.toISOString() } },
            { contractEndsAt: { less_than: soon.toISOString() } },
          ],
        },
        sort: 'contractEndsAt',
      }),

      // A published listing with no code cannot go in the magazine. The hook
      // mints one, so anything here means it failed. Only on a tier that gets a
      // code: a basic listing has none by design.
      payload.find({
        ...opts,
        collection: 'businesses',
        where: {
          and: [
            { qrCode: { exists: false } },
            { _status: { equals: 'published' } },
            { tier: { in: TIERS_WITH_CODES } },
          ],
        },
      }),

      payload.find({
        ...opts,
        collection: 'statements',
        where: {
          and: [{ status: { equals: 'sent' } }, { 'lines.disputeOutcome': { equals: 'open' } }],
        },
      }),
      payload.find({
        ...opts,
        collection: 'statements',
        where: {
          and: [{ status: { equals: 'sent' } }, { dueAt: { less_than: now.toISOString() } }],
        },
        sort: 'dueAt',
      }),
      payload.count({
        collection: 'statements',
        where: { status: { equals: 'draft' } },
        overrideAccess: false,
        user,
      }),
      payload.count({
        collection: 'reviews',
        where: { status: { equals: 'pending' } },
        overrideAccess: false,
        user,
      }),
    ])

  const attention: AttentionItem[] = []

  // Site setup first: each affects the whole site rather than one listing, and
  // each fails silently everywhere else.
  const indexing = indexingNotice(undefined, comingSoonConfig().enabled)
  if (indexing) attention.push({ area: 'Site setup', ...indexing })
  const email = emailWarning()
  if (email) {
    attention.push({
      area: 'Site setup',
      title: 'Email is not delivering',
      detail: email,
      tone: email.includes('redirected') ? 'error' : 'warn',
    })
  }

  for (const doc of disputed.docs as { id: number; number?: string | null }[]) {
    attention.push({
      area: 'Booking fees',
      title: `${doc.number ?? `Statement ${doc.id}`}: a line was questioned`,
      detail: 'Check with the guest, then set the line to upheld (removed) or rejected (kept).',
      href: `/admin/collections/statements/${doc.id}`,
      tone: 'warn',
    })
  }
  for (const doc of overdue.docs as {
    id: number
    number?: string | null
    dueAt?: string
    sentAt?: string
  }[]) {
    attention.push({
      area: 'Booking fees',
      title: `${doc.number ?? `Statement ${doc.id}`}: overdue`,
      detail: overdueDetail(doc.dueAt, doc.sentAt, now),
      href: `/admin/collections/statements/${doc.id}`,
      tone: 'error',
    })
  }
  if (drafts.totalDocs > 0) {
    attention.push({
      area: 'Booking fees',
      title: `${drafts.totalDocs} draft statement${drafts.totalDocs === 1 ? '' : 's'} not sent`,
      detail: 'Read them, then send them from Booking fees. Venues see nothing until then.',
      href: '/admin/billing',
      tone: 'warn',
    })
  }

  for (const doc of expired.docs as {
    id: number
    name?: string | null
    contractEndsAt?: string
    tier?: unknown
  }[]) {
    attention.push({
      area: 'Listings',
      title: `${doc.name ?? `Listing ${doc.id}`}: contract ended`,
      detail: `Ended ${formatDate(doc.contractEndsAt)}, still on ${TIER_LABELS[tierOf(doc.tier)]}. Renew it, or change the tier.`,
      href: `/admin/collections/businesses/${doc.id}`,
      tone: 'error',
    })
  }
  for (const doc of expiring.docs as {
    id: number
    name?: string | null
    contractEndsAt?: string
  }[]) {
    attention.push({
      area: 'Listings',
      title: `${doc.name ?? `Listing ${doc.id}`}: contract ending`,
      detail: `Ends ${formatDate(doc.contractEndsAt)}. Time to talk about renewing.`,
      href: `/admin/collections/businesses/${doc.id}`,
      tone: 'warn',
    })
  }
  for (const doc of codeless.docs as { id: number; name?: string | null }[]) {
    attention.push({
      area: 'Listings',
      title: `${doc.name ?? `Listing ${doc.id}`}: no QR code`,
      detail:
        'Published on Silver with no QR code, so it cannot go to print. Save the listing once to create one.',
      href: `/admin/collections/businesses/${doc.id}`,
      tone: 'error',
    })
  }

  if (reviews.totalDocs > 0) {
    attention.push({
      area: 'Reviews',
      title: `${reviews.totalDocs} review${reviews.totalDocs === 1 ? '' : 's'} waiting for approval`,
      detail: 'Guests cannot see a review until it is approved.',
      href: '/admin/collections/reviews?where[status][equals]=pending',
      tone: 'warn',
    })
  }

  const feesOwed = (owed.docs as { total?: number | null }[]).reduce(
    (sum, doc) => sum + Number(doc.total ?? 0),
    0,
  )

  return {
    numbers: {
      listingsLive: counts.publishedListings,
      listingDrafts: counts.draftListings,
      bookingsThisMonth: bookings.totalDocs,
      scans: counts.recentScans,
      feesOwed,
    },
    attention,
  }
}
