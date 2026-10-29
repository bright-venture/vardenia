import { headers as nextHeaders } from 'next/headers'
import { getPayload } from 'payload'
import {
  canSendReceipt,
  buildPassport,
  type AttendanceVerdict,
  type BookingStatus,
  type GuestAnswer,
  type PassportStamp,
  type PassportVisit,
  type PendingStamp,
} from '@vardenia/core'
import { dataLocale, type Locale } from '@vardenia/i18n'
import config from '../payload.config'
import { CUSTOMER_COLLECTION } from '../access/index'
import { findEvery } from './find-every'
import { attendanceToken } from './attendance'

/**
 * The signed-in guest's passport, read from their own bookings.
 *
 * There is no stamps table. A stamp is a fact about a booking - see
 * core/passport - so it is derived every time from the bookings that already
 * say it, and a venue correcting a booking to a no-show takes the stamp with it
 * without anything else to keep in step.
 *
 * # Read as the guest
 *
 * `overrideAccess: false` with their own user, so the Bookings collection's
 * `{ customer: { equals: user.id } }` rule does the filtering, exactly as on the
 * account page. See lib/session customerBookings for why that constraint is
 * never written here.
 *
 * # Partner places only
 *
 * A place stamps once it has a partner account: somebody at the venue who
 * answers its bookings. The lookup reads business-users with access overridden,
 * because a guest cannot read that collection; it asks only which of these
 * listings have an account, and returns listing ids and nothing about anybody.
 */

export interface PassportPlace {
  name: string
  /** Empty for a listing that is no longer published, which renders unlinked. */
  slug: string
  category: string | null
  governorate: string | null
  district: string | null
}

export interface PassportView {
  /** `receiptToken` opens the receipt form for the place's latest visit that takes one. */
  stamps: (PassportStamp & { place: PassportPlace; receiptToken?: string })[]
  /** `token` is set on a visit waiting for the guest's answer: see lib/attendance. */
  pending: (PendingStamp & { place: PassportPlace; token?: string; receiptToken?: string })[]
  points: number
  milestones: ReturnType<typeof buildPassport>['milestones']
}

interface BookingRow {
  id: number
  status: BookingStatus
  end: string
  guestAnswer?: GuestAnswer | null
  attendanceVerdict?: AttendanceVerdict | null
  receipt?: unknown
  business:
    | number
    | {
        id: number
        name?: string | null
        slug?: string | null
        category?: string | null
        governorate?: string | null
        district?: string | null
        _status?: string | null
      }
    | null
}

export async function passportForCurrent(locale: Locale): Promise<PassportView | null> {
  const payload = await getPayload({ config })

  const auth = await payload
    .auth({ headers: await nextHeaders() })
    .catch(() => ({ user: null }) as { user: null })

  const user = auth.user
  if (!user || user.collection !== CUSTOMER_COLLECTION) return null

  const { docs } = await findEvery<BookingRow>(payload, {
    collection: 'bookings',
    // The statuses that can stamp, and the two a disputed visit can have (a
    // guest says they came to a booking marked no-show or cancelled, which
    // the passport shows as being checked). See core stampStateOf.
    where: { status: { in: ['completed', 'confirmed', 'no-show', 'cancelled'] } },
    depth: 1,
    locale: dataLocale(locale),
    select: {
      status: true,
      end: true,
      business: true,
      guestAnswer: true,
      attendanceVerdict: true,
      receipt: true,
    },
    populate: {
      businesses: {
        name: true,
        slug: true,
        category: true,
        governorate: true,
        district: true,
        _status: true,
      },
    },
    overrideAccess: false,
    user,
  })

  const places = new Map<string, PassportPlace>()
  for (const row of docs) {
    const business = row.business
    // A deleted listing resolves to null or a bare id. Nothing to stamp with.
    if (!business || typeof business !== 'object') continue
    places.set(String(business.id), {
      name: business.name ?? '',
      slug: business._status === 'draft' ? '' : (business.slug ?? ''),
      category: business.category ?? null,
      governorate: business.governorate ?? null,
      district: business.district ?? null,
    })
  }

  const partners = await partnerIds([...places.keys()])

  const visits: PassportVisit[] = []
  for (const row of docs) {
    const business = row.business
    if (!business || typeof business !== 'object') continue
    const id = String(business.id)
    if (!partners.has(id)) continue
    visits.push({
      businessId: id,
      bookingId: String(row.id),
      status: row.status,
      end: new Date(row.end),
      guestAnswer: row.guestAnswer ?? null,
      verdict: row.attendanceVerdict ?? null,
      category: business.category,
      governorate: business.governorate,
    })
  }

  const now = new Date()
  const passport = buildPassport(visits, now)

  /*
   * Per place, the latest visit that still takes a receipt (core/canSendReceipt),
   * so a stamp can offer "Add your receipt" for it. One link per place, like
   * the stamp itself, however many visits the place has had.
   */
  const receiptFor = new Map<string, { end: number; token: string }>()
  for (const row of docs) {
    const business = row.business
    if (!business || typeof business !== 'object') continue
    const id = String(business.id)
    const open = canSendReceipt(
      {
        status: row.status,
        end: new Date(row.end),
        guestAnswer: row.guestAnswer ?? null,
        hasReceipt: row.receipt != null,
      },
      now,
    )
    const end = new Date(row.end).getTime()
    if (open && end > (receiptFor.get(id)?.end ?? -Infinity)) {
      receiptFor.set(id, { end, token: attendanceToken(row.id) })
    }
  }
  const receiptToken = (businessId: string) => {
    const found = receiptFor.get(businessId)
    return found ? { receiptToken: found.token } : {}
  }

  return {
    stamps: passport.stamps.map((stamp) => ({
      ...stamp,
      place: places.get(stamp.businessId)!,
      ...receiptToken(stamp.businessId),
    })),
    pending: passport.pending.map((stamp) => ({
      ...stamp,
      place: places.get(stamp.businessId)!,
      ...receiptToken(stamp.businessId),
      ...(stamp.kind === 'confirm' && stamp.bookingId
        ? { token: attendanceToken(stamp.bookingId) }
        : {}),
    })),
    points: passport.points,
    milestones: passport.milestones,
  }
}

/** Which of these listings have a partner account, as id strings. */
async function partnerIds(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set()
  const payload = await getPayload({ config })

  const { docs } = await findEvery<{ businesses?: (number | { id: number })[] | null }>(payload, {
    collection: 'business-users',
    where: { businesses: { in: ids.map(Number) } },
    depth: 0,
    select: { businesses: true },
    overrideAccess: true,
  })

  const wanted = new Set(ids)
  const found = new Set<string>()
  for (const doc of docs) {
    for (const business of doc.businesses ?? []) {
      const id = String(typeof business === 'object' ? business.id : business)
      if (wanted.has(id)) found.add(id)
    }
  }
  return found
}
