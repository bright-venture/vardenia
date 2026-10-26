import { createHmac, timingSafeEqual } from 'node:crypto'
import type { Payload } from 'payload'
import {
  attendanceMismatch,
  canGuestAnswer,
  shouldAskGuest,
  ASK_AFTER_HOURS,
  ASK_WITHIN_DAYS,
  ATTENDANCE_START,
  type AttendanceMismatch,
  type BookingStatus,
  type GuestAnswer,
} from '@vardenia/core'
import { dataLocale, isLocale, type Locale } from '@vardenia/i18n'
import { siteOrigin } from './auth-email'
import { attendanceEmailContent } from './attendance-email'
import { reportError } from './report'

/**
 * Asking guests whether they came, and acting on the answer.
 *
 * The rules are in packages/core/src/attendance; this is the part that talks
 * to the database and sends mail. See that file for why it exists.
 */

// ---------------------------------------------------------------------------
// The link in the email
// ---------------------------------------------------------------------------

/**
 * A token naming one booking, signed so nobody can answer for a booking that
 * is not theirs by changing a number in a link.
 *
 * It names the booking and nothing else - not the answer - so the same link
 * serves both buttons, and the page asks the guest to press once more.
 */
const sign = (id: string) =>
  createHmac('sha256', `${process.env.PAYLOAD_SECRET || 'vardenia-development-only'}:attendance`)
    .update(id)
    .digest('base64url')
    .slice(0, 24)

export function attendanceToken(bookingId: number | string): string {
  const id = String(bookingId)
  return `${id}.${sign(id)}`
}

/** The booking id a token names, or null when the token was not ours. */
export function bookingIdFromToken(token: string): number | null {
  const [id, mac] = token.split('.')
  if (!id || !mac || !/^\d+$/.test(id)) return null
  const expected = Buffer.from(sign(id))
  const given = Buffer.from(mac)
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
  return Number(id)
}

/** The page that asks the question, in the guest's language. */
export function visitPageUrl(token: string, locale: Locale, answer?: GuestAnswer): string {
  const prefix = locale === 'en' ? '' : `/${locale}`
  return `${siteOrigin()}${prefix}/visit/${token}${answer ? `?answer=${answer}` : ''}`
}

// ---------------------------------------------------------------------------
// Asking
// ---------------------------------------------------------------------------

/** How many emails one run sends; the job runs every hour. */
export const ASK_BATCH = 25

interface AskRow {
  id: number
  status: BookingStatus
  start: string
  end: string
  locale?: string | null
  attendanceAskedAt?: string | null
  guestAnswer?: GuestAnswer | null
  customer?:
    | { id: number; name?: string | null; email?: string | null; deletedAt?: string | null }
    | number
    | null
  business?: { id: number; name?: string | null } | number | null
}

export interface AskResult {
  asked: number
  skipped: number
  failed: number
}

/**
 * Sends "Did you go?" for visits that ended a couple of hours ago.
 *
 * Each booking is claimed before its email goes: `attendanceAskedAt` is set
 * only where it is still empty, so two runs at once cannot both ask the same
 * guest. A send that then fails is not retried; asking twice is worse than not
 * asking, and the guest can still answer from their passport.
 */
export async function askGuestsAboutVisits(
  payload: Payload,
  now: Date = new Date(),
): Promise<AskResult> {
  const latestEnd = new Date(now.getTime() - ASK_AFTER_HOURS * 3_600_000)
  const earliestEnd = new Date(
    Math.max(ATTENDANCE_START.getTime(), now.getTime() - ASK_WITHIN_DAYS * 86_400_000),
  )

  const due = await payload.find({
    collection: 'bookings',
    where: {
      and: [
        { status: { in: ['confirmed', 'completed', 'no-show'] } },
        { end: { less_than_equal: latestEnd.toISOString() } },
        { end: { greater_than: earliestEnd.toISOString() } },
        { attendanceAskedAt: { exists: false } },
        { guestAnswer: { exists: false } },
      ],
    },
    sort: 'end',
    limit: ASK_BATCH,
    depth: 1,
    overrideAccess: true,
  })

  const result: AskResult = { asked: 0, skipped: 0, failed: 0 }

  for (const doc of due.docs as unknown as AskRow[]) {
    const customer = typeof doc.customer === 'object' ? doc.customer : null
    const business = typeof doc.business === 'object' ? doc.business : null
    const facts = {
      status: doc.status,
      end: new Date(doc.end),
      askedAt: doc.attendanceAskedAt ? new Date(doc.attendanceAskedAt) : null,
      guestAnswer: doc.guestAnswer ?? null,
    }
    if (!customer?.email || customer.deletedAt || !business || !shouldAskGuest(facts, now)) {
      result.skipped += 1
      continue
    }

    try {
      const claimed = await payload.update({
        collection: 'bookings',
        where: { and: [{ id: { equals: doc.id } }, { attendanceAskedAt: { exists: false } }] },
        data: { attendanceAskedAt: now.toISOString() } as never,
        depth: 0,
        overrideAccess: true,
        context: { attendance: true },
      })
      if (claimed.docs.length === 0) {
        result.skipped += 1
        continue
      }

      const locale: Locale = doc.locale && isLocale(doc.locale) ? doc.locale : 'en'
      const place = await placeName(payload, business.id, locale, business.name)
      const token = attendanceToken(doc.id)
      const content = attendanceEmailContent({
        name: customer.name || '',
        place,
        start: new Date(doc.start),
        locale,
        yesUrl: visitPageUrl(token, locale, 'came'),
        noUrl: visitPageUrl(token, locale, 'did-not-come'),
      })
      await payload.sendEmail({ to: customer.email, ...content })
      result.asked += 1
    } catch (error) {
      result.failed += 1
      await reportError(error, { source: 'attendance.ask', extra: { booking: doc.id } })
    }
  }

  return result
}

/** The listing's name in the guest's language where there is one. */
async function placeName(
  payload: Payload,
  businessId: number,
  locale: Locale,
  fallback?: string | null,
): Promise<string> {
  const wanted = dataLocale(locale)
  if (wanted === 'en' && fallback) return fallback
  const doc = await payload
    .findByID({
      collection: 'businesses',
      id: businessId,
      depth: 0,
      locale: wanted,
      overrideAccess: true,
    })
    .catch(() => null)
  return (doc as { name?: string } | null)?.name || fallback || 'Vardenia'
}

// ---------------------------------------------------------------------------
// Answering
// ---------------------------------------------------------------------------

export type AnswerOutcome = 'recorded' | 'already' | 'closed' | 'not-found'

export interface VisitSummary {
  bookingId: number
  place: string
  start: Date
  answer: GuestAnswer | null
  open: boolean
}

/** What the visit page shows: the place, the time, and whether it can still be answered. */
export async function visitSummary(
  payload: Payload,
  bookingId: number,
  locale: Locale,
  now: Date = new Date(),
): Promise<VisitSummary | null> {
  const doc = (await payload
    .findByID({ collection: 'bookings', id: bookingId, depth: 0, overrideAccess: true })
    .catch(() => null)) as unknown as AskRow | null
  if (!doc) return null
  const businessId = typeof doc.business === 'object' ? doc.business?.id : doc.business
  const place = businessId ? await placeName(payload, businessId, locale) : 'Vardenia'
  const facts = { status: doc.status, end: new Date(doc.end), guestAnswer: doc.guestAnswer ?? null }
  return {
    bookingId: doc.id,
    place,
    start: new Date(doc.start),
    answer: doc.guestAnswer ?? null,
    open: canGuestAnswer(facts, now),
  }
}

/**
 * Records the guest's answer. The first answer is final.
 *
 * Written only where no answer exists yet, so a double press or two tabs
 * cannot overwrite one answer with another. If it disagrees with what the venue
 * recorded, the team is told.
 */
export async function recordGuestAnswer(
  payload: Payload,
  bookingId: number,
  answer: GuestAnswer,
  now: Date = new Date(),
): Promise<AnswerOutcome> {
  const doc = (await payload
    .findByID({ collection: 'bookings', id: bookingId, depth: 0, overrideAccess: true })
    .catch(() => null)) as unknown as (AskRow & { reference?: string | null }) | null
  if (!doc) return 'not-found'
  if (doc.guestAnswer) return 'already'
  const facts = { status: doc.status, end: new Date(doc.end), guestAnswer: null }
  if (!canGuestAnswer(facts, now)) return 'closed'

  const written = await payload.update({
    collection: 'bookings',
    where: { and: [{ id: { equals: bookingId } }, { guestAnswer: { exists: false } }] },
    data: { guestAnswer: answer, guestAnsweredAt: now.toISOString() } as never,
    depth: 0,
    overrideAccess: true,
    context: { attendance: true },
  })
  if (written.docs.length === 0) return 'already'

  const mismatch = attendanceMismatch({ ...facts, guestAnswer: answer })
  if (mismatch) await alertTeam(payload, bookingId, mismatch)
  return 'recorded'
}

// ---------------------------------------------------------------------------
// Telling the team
// ---------------------------------------------------------------------------

/** Where disputed visits are reported: its own address, or the error alerts'. */
const teamAddress = () =>
  process.env.ATTENDANCE_ALERT_TO?.trim() || process.env.ERROR_ALERT_TO?.trim() || null

const MISMATCH_TEXT: Record<AttendanceMismatch, string> = {
  'guest-says-came': 'The guest says they came, but the venue marked the booking',
  'guest-says-absent': 'The guest says they did not come, but the venue marked the booking',
}

/**
 * Emails the team about one disputed visit. Never throws: the guest's answer
 * is already saved, and a mail failure must not turn it into an error page.
 * The dispute also shows in the performance report, so a lost email is not a
 * lost dispute.
 */
export async function alertTeam(
  payload: Payload,
  bookingId: number,
  mismatch: AttendanceMismatch,
): Promise<void> {
  const to = teamAddress()
  if (!to) return
  try {
    const doc = (await payload.findByID({
      collection: 'bookings',
      id: bookingId,
      depth: 1,
      overrideAccess: true,
    })) as unknown as AskRow & { reference?: string | null }
    const business = typeof doc.business === 'object' ? doc.business : null
    const link = `${siteOrigin()}/admin/collections/bookings/${bookingId}`
    const subject = `Disputed visit: ${business?.name ?? 'a listing'} (${doc.reference ?? bookingId})`
    const text = [
      `${MISMATCH_TEXT[mismatch]} "${doc.status}".`,
      '',
      `Place: ${business?.name ?? '-'}`,
      `Booking: ${doc.reference ?? bookingId}`,
      `Visit: ${new Date(doc.start).toISOString().slice(0, 16).replace('T', ' ')} UTC`,
      '',
      'Check with the venue, then set "Team decision" on the booking:',
      link,
      '',
      '"The guest is right" puts the visit on the next statement and gives the guest their stamp.',
    ].join('\n')
    await payload.sendEmail({
      to,
      subject,
      text,
      html: `<pre style="font:14px/1.5 monospace">${text.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre>`,
    })
  } catch (error) {
    await reportError(error, { source: 'attendance.alert', extra: { booking: bookingId } })
  }
}
