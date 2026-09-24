/**
 * Booking-fee demo data for the dev database, so the whole pipeline can be seen.
 *
 *   pnpm seed:billing          add it
 *   pnpm seed:billing:reset    take it away again
 *
 * What it builds, on the seeded fixture venues:
 *
 * - Fee settings on five venues: a restaurant per guest with a cap, a hotel and
 *   a guesthouse per night, an activity per person, and a winery inside a
 *   launch offer so it owes nothing.
 * - Bookings in June, July and August 2026: guests who came, no-shows,
 *   cancellations, and confirmed bookings nobody marked.
 * - Statements for June and July in every state: one paid, one overdue, one
 *   sent with a line the venue questioned, and one draft waiting to be sent.
 * - August is left for you: open Booking fees in the admin, pick 2026-08, and
 *   press Draw up drafts to watch the monthly run mark and bill it.
 *
 * Beit Douma's July statement is the one to open as its partner
 * (partner@vardenia.local): it was sent two days ago, so its lines can still be
 * questioned.
 *
 * Bookings are written straight to the database, past the booking hooks: those
 * check availability for a booking being made now and would refuse one dated
 * last June. Statements go through the collection, so their numbers and totals
 * come out exactly as the real thing produces them. Nothing sends an email.
 *
 * Guarded like the main seed: it refuses any database but SEED_ALLOWED_DB.
 */

import path from 'node:path'
import { readFile, unlink, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { config as loadEnv } from 'dotenv'
import { getPayload, type Payload } from 'payload'
import {
  feeFor,
  generateBookingReference,
  statementDeadlines,
  type BookingStatus,
  type FeeSettings,
} from '@vardenia/core'
import { assertSeedTarget } from './guard'

const here = path.dirname(fileURLToPath(import.meta.url))
loadEnv({ path: path.resolve(here, '../../../../.env') })

const MANIFEST = path.resolve(here, '../../.billing-demo-manifest.json')

interface DemoManifest {
  createdAt: string
  bookings: number[]
  statements: number[]
  /** Each venue's fee settings before the demo, to put back on reset. */
  fees: Record<string, FeeSettings | null>
}

// ---------------------------------------------------------------------------
// The venues and their fees
// ---------------------------------------------------------------------------

const VENUES: Record<string, FeeSettings> = {
  'em-sherif': { unit: 'guest', amount: 1, cap: 12 },
  'hotel-albergo': { unit: 'night', amount: 8 },
  'beit-douma': { unit: 'night', amount: 6 },
  'mzaar-kfardebian': { unit: 'guest', amount: 1.5 },
  // Inside its launch offer until the end of October: every booking is free.
  'chateau-ksara': { unit: 'guest', amount: 1, waivedUntil: '2026-10-31' },
}

// ---------------------------------------------------------------------------
// The bookings
// ---------------------------------------------------------------------------

interface DemoBooking {
  venue: keyof typeof VENUES
  /** Beirut day it starts. */
  day: string
  status: BookingStatus
  party: number
  /** Nights, for a stay. Empty for a table or an activity. */
  nights?: number
}

const table = (
  venue: DemoBooking['venue'],
  day: string,
  party: number,
  status: BookingStatus = 'completed',
) => ({ venue, day, party, status }) as DemoBooking
const stay = (
  venue: DemoBooking['venue'],
  day: string,
  nights: number,
  status: BookingStatus = 'completed',
) => ({ venue, day, party: 2, nights, status }) as DemoBooking

const BOOKINGS: DemoBooking[] = [
  // June: Em Sherif, billed and paid.
  table('em-sherif', '2026-06-05', 2),
  table('em-sherif', '2026-06-12', 4),
  table('em-sherif', '2026-06-20', 6),
  table('em-sherif', '2026-06-27', 2, 'no-show'),

  // July: four venues, statements in four different states.
  table('em-sherif', '2026-07-03', 3),
  table('em-sherif', '2026-07-11', 5),
  table('em-sherif', '2026-07-18', 2),
  table('em-sherif', '2026-07-25', 4, 'cancelled'),
  stay('hotel-albergo', '2026-07-02', 2),
  stay('hotel-albergo', '2026-07-14', 3),
  stay('hotel-albergo', '2026-07-22', 1),
  stay('beit-douma', '2026-07-05', 2),
  stay('beit-douma', '2026-07-12', 1),
  stay('beit-douma', '2026-07-19', 3),
  stay('beit-douma', '2026-07-26', 2, 'no-show'),

  // August: left undrawn, for the monthly run.
  table('em-sherif', '2026-08-01', 2),
  table('em-sherif', '2026-08-07', 4),
  table('em-sherif', '2026-08-14', 14), // a large table: the $12 cap applies
  table('em-sherif', '2026-08-20', 3),
  table('em-sherif', '2026-08-22', 2, 'no-show'),
  table('em-sherif', '2026-08-24', 6, 'cancelled'),
  table('em-sherif', '2026-08-27', 4, 'confirmed'), // never marked: counted
  table('em-sherif', '2026-08-30', 2, 'confirmed'), // never marked: counted
  stay('hotel-albergo', '2026-08-03', 1),
  stay('hotel-albergo', '2026-08-10', 2),
  stay('hotel-albergo', '2026-08-18', 3),
  stay('hotel-albergo', '2026-08-25', 2, 'confirmed'), // never marked: counted
  stay('beit-douma', '2026-08-06', 2),
  stay('beit-douma', '2026-08-28', 1, 'confirmed'), // never marked: counted
  table('mzaar-kfardebian', '2026-08-02', 2),
  table('mzaar-kfardebian', '2026-08-09', 4),
  table('mzaar-kfardebian', '2026-08-16', 8),
  table('mzaar-kfardebian', '2026-08-23', 3),
  table('mzaar-kfardebian', '2026-08-29', 5, 'no-show'),
  table('chateau-ksara', '2026-08-08', 6), // launch offer: not billed
  table('chateau-ksara', '2026-08-15', 4), // launch offer: not billed
]

/** Beirut is UTC+3 in summer. Tables at 20:00 for two hours; stays 14:00 to 11:00. */
function interval(booking: DemoBooking): { start: Date; end: Date } {
  if (booking.nights) {
    const start = new Date(`${booking.day}T11:00:00Z`)
    const end = new Date(start.getTime() + booking.nights * 86_400_000 - 3 * 3_600_000)
    return { start, end }
  }
  const start = new Date(`${booking.day}T17:00:00Z`)
  return { start, end: new Date(start.getTime() + 2 * 3_600_000) }
}

// ---------------------------------------------------------------------------
// The statements, June and July
// ---------------------------------------------------------------------------

interface DemoStatement {
  venue: DemoBooking['venue']
  period: string
  status: 'draft' | 'sent' | 'paid'
  /** When it was sent. Empty for a draft. */
  sentAt?: Date
  paidAt?: Date
  /** Index, within its lines, of a line the venue questioned. */
  disputedLine?: number
}

const DAY = 86_400_000
const now = new Date()

const STATEMENTS: DemoStatement[] = [
  // Paid on time.
  {
    venue: 'em-sherif',
    period: '2026-06',
    status: 'paid',
    sentAt: new Date('2026-07-08T09:00:00Z'),
    paidAt: new Date('2026-07-15T09:00:00Z'),
  },
  // Still unpaid long after its due date: overdue, and past the 30 days.
  {
    venue: 'hotel-albergo',
    period: '2026-07',
    status: 'sent',
    sentAt: new Date('2026-08-08T09:00:00Z'),
  },
  // Sent two days ago, with one line already questioned. Open it as the
  // partner to question another.
  {
    venue: 'beit-douma',
    period: '2026-07',
    status: 'sent',
    sentAt: new Date(now.getTime() - 2 * DAY),
    disputedLine: 2,
  },
  // Drawn up, not sent: the Send button on the July page is live.
  { venue: 'em-sherif', period: '2026-07', status: 'draft' },
]

// ---------------------------------------------------------------------------

async function loadManifest(): Promise<DemoManifest | null> {
  try {
    return JSON.parse(await readFile(MANIFEST, 'utf8')) as DemoManifest
  } catch {
    return null
  }
}

async function venueIds(payload: Payload): Promise<Record<string, number>> {
  const found = await payload.find({
    collection: 'businesses',
    where: { slug: { in: Object.keys(VENUES) } },
    depth: 0,
    limit: 20,
    draft: true,
    overrideAccess: true,
    select: { slug: true, bookingFee: true },
  })
  const ids: Record<string, number> = {}
  for (const doc of found.docs as { id: number; slug?: string }[]) {
    if (doc.slug) ids[doc.slug] = doc.id
  }
  const missing = Object.keys(VENUES).filter((slug) => !(slug in ids))
  if (missing.length > 0) {
    throw new Error(`Run pnpm seed first. These fixture venues are missing: ${missing.join(', ')}`)
  }
  return ids
}

async function setFee(payload: Payload, id: number, fee: FeeSettings | null) {
  await payload.update({
    collection: 'businesses',
    id,
    data: {
      bookingFee: fee ?? { unit: null, amount: null, cap: null, waivedUntil: null },
    } as never,
    overrideAccess: true,
    context: { skipAutoTranslate: true },
  })
}

async function add(payload: Payload) {
  if (await loadManifest()) {
    throw new Error('The billing demo is already in. Remove it first with: pnpm seed:billing:reset')
  }

  const ids = await venueIds(payload)
  const manifest: DemoManifest = {
    createdAt: new Date().toISOString(),
    bookings: [],
    statements: [],
    fees: {},
  }

  try {
    // A guest to book as: any verified customer the dev database already has.
    const guest = await payload.find({
      collection: 'customers',
      where: { _verified: { equals: true } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    const customerId = (guest.docs[0] as { id?: number } | undefined)?.id
    if (!customerId) throw new Error('No verified customer in the dev database to book as.')

    // Fees, remembering what was there before.
    for (const [slug, fee] of Object.entries(VENUES)) {
      const current = (await payload.findByID({
        collection: 'businesses',
        id: ids[slug]!,
        depth: 0,
        draft: true,
        overrideAccess: true,
      })) as { bookingFee?: FeeSettings | null }
      manifest.fees[slug] = current.bookingFee?.unit ? current.bookingFee : null
      await setFee(payload, ids[slug]!, fee)
    }

    // Bookings, straight to the database.
    const made: { demo: DemoBooking; id: number; reference: string; start: Date; end: Date }[] = []
    for (const demo of BOOKINGS) {
      const { start, end } = interval(demo)
      const reference = generateBookingReference()
      const doc = (await payload.db.create({
        collection: 'bookings',
        data: {
          reference,
          business: ids[demo.venue],
          customer: customerId,
          start: start.toISOString(),
          end: end.toISOString(),
          partySize: demo.party,
          status: demo.status,
          locale: 'en',
          notes: 'Billing demo',
        },
      })) as { id: number }
      manifest.bookings.push(doc.id)
      made.push({ demo, id: doc.id, reference, start, end })
    }

    // Statements for June and July, through the collection.
    for (const plan of STATEMENTS) {
      const fee = VENUES[plan.venue]!
      const lines = made
        .filter((row) => row.demo.venue === plan.venue && row.demo.day.startsWith(plan.period))
        .flatMap((row) => {
          const line = feeFor(
            fee,
            {
              start: row.start,
              end: row.end,
              partySize: row.demo.party,
              status: row.demo.status,
              day: row.demo.day,
            },
            now,
          )
          return line
            ? [
                {
                  booking: row.id,
                  reference: row.reference,
                  day: row.demo.day,
                  ...line,
                  disputeOutcome: 'none' as const,
                },
              ]
            : []
        })

      if (plan.disputedLine !== undefined && lines[plan.disputedLine]) {
        Object.assign(lines[plan.disputedLine]!, {
          disputeOutcome: 'open',
          disputeReason: 'The guests cancelled on the day and never arrived.',
          disputedAt: new Date(plan.sentAt!.getTime() + DAY).toISOString(),
        })
      }

      const dates = plan.sentAt ? statementDeadlines(plan.sentAt) : null
      const doc = (await payload.create({
        collection: 'statements',
        data: {
          business: ids[plan.venue]!,
          period: plan.period,
          status: plan.status,
          lines,
          ...(plan.sentAt && dates
            ? {
                sentAt: plan.sentAt.toISOString(),
                disputeUntil: dates.disputeUntil.toISOString(),
                dueAt: dates.dueAt.toISOString(),
              }
            : {}),
          ...(plan.paidAt
            ? {
                paidAt: plan.paidAt.toISOString(),
                paymentMethod: 'whish',
                paymentReference: 'WH-DEMO-0615',
              }
            : {}),
        } as never,
        overrideAccess: true,
        // A demo must never email a venue.
        context: { skipStatementEmail: true },
      })) as { id: number }
      manifest.statements.push(doc.id)
    }
  } finally {
    await writeFile(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  }

  payload.logger.info(
    `Billing demo in: fees on ${Object.keys(VENUES).length} venues, ${manifest.bookings.length} bookings, ${manifest.statements.length} statements.`,
  )
  payload.logger.info('Open Booking fees in the admin, pick 2026-08 and press Draw up drafts.')
  payload.logger.info('Remove it again with: pnpm seed:billing:reset')
}

async function reset(payload: Payload) {
  const manifest = await loadManifest()
  if (!manifest) {
    payload.logger.info('No billing demo recorded, so there is nothing to remove.')
    return
  }

  const ids = await venueIds(payload)
  const bookingIds = new Set(manifest.bookings)

  // Every statement that bills a demo booking, including the ones the monthly
  // run drew up for August after the demo went in.
  const statements = await payload.find({
    collection: 'statements',
    where: { business: { in: Object.values(ids) } },
    depth: 0,
    limit: 500,
    overrideAccess: true,
  })
  let removedStatements = 0
  for (const doc of statements.docs as { id: number; lines?: { booking?: number | null }[] }[]) {
    const ours =
      manifest.statements.includes(doc.id) ||
      (doc.lines ?? []).some((line) => line.booking && bookingIds.has(Number(line.booking)))
    if (!ours) continue
    await payload.delete({ collection: 'statements', id: doc.id, overrideAccess: true })
    removedStatements += 1
  }

  for (const id of manifest.bookings) {
    await payload.db.deleteOne({ collection: 'bookings', where: { id: { equals: id } } })
  }

  for (const [slug, fee] of Object.entries(manifest.fees)) {
    if (ids[slug]) await setFee(payload, ids[slug]!, fee)
  }

  await unlink(MANIFEST).catch(() => undefined)
  payload.logger.info(
    `Billing demo removed: ${removedStatements} statements, ${manifest.bookings.length} bookings, fees restored on ${Object.keys(manifest.fees).length} venues.`,
  )
}

async function main() {
  // Before getPayload, like the main seed: initialising Payload against the
  // wrong database would already sync its schema.
  const target = assertSeedTarget()
  console.log(`Billing demo on ${target}`)

  const { default: config } = await import('../payload.config')
  const payload = await getPayload({ config })

  if (process.argv.includes('--reset')) await reset(payload)
  else await add(payload)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
