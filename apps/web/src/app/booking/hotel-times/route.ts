import { headers as nextHeaders } from 'next/headers'
import { getPayload } from 'payload'
import { canHaveRoomTypes, isWholePropertyStay } from '@vardenia/core'
import config from '../../../payload.config'
import { isStaffUser, ownedBusinessIds } from '../../../access/index'
import { withRateLimit } from '../../../lib/rate-limit'

/**
 * A partner sets their hotel's check-in and check-out times (17 November 2026).
 *
 * The booking rules are otherwise the team's (fields/bookingRules is staff-only
 * at field level), so this is the one door a partner has into them, and it
 * writes these two values and nothing else. Only for a hotel or getaway the
 * partner owns.
 *
 * `POST /booking/hotel-times` with `{ business, checkInTime, checkOutTime }`.
 */

export const dynamic = 'force-dynamic'

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store' } })

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

export const POST = withRateLimit(async (request: Request) => {
  const body = (await request.json().catch(() => null)) as {
    business?: unknown
    checkInTime?: unknown
    checkOutTime?: unknown
  } | null
  const businessId = Number(body?.business)
  const checkIn = String(body?.checkInTime ?? '')
  const checkOut = String(body?.checkOutTime ?? '')
  if (!Number.isInteger(businessId) || !TIME.test(checkIn) || !TIME.test(checkOut)) {
    return json({ ok: false, message: 'Use 24-hour times, like 15:00.' }, 400)
  }

  const payload = await getPayload({ config })
  const { user } = await payload
    .auth({ headers: await nextHeaders() })
    .catch(() => ({ user: null }) as { user: null })
  const allowed =
    isStaffUser(user) || ownedBusinessIds(user).map(String).includes(String(businessId))
  if (!user || !allowed) return json({ ok: false, message: 'Not allowed.' }, 403)

  const business = await payload
    .findByID({
      collection: 'businesses',
      id: businessId,
      depth: 0,
      overrideAccess: true,
      select: { subcategories: true },
    })
    .catch(() => null)
  // Hotels, and guest houses booked whole (Task 6): both sell nights.
  const kinds = (business as { subcategories?: string[] } | null)?.subcategories ?? []
  if (!business || !(canHaveRoomTypes(kinds) || isWholePropertyStay(kinds))) {
    return json({ ok: false, message: 'Only hotels and guest houses have check-in times.' }, 400)
  }

  await payload.update({
    collection: 'businesses',
    id: businessId,
    data: { booking: { checkInTime: checkIn, checkOutTime: checkOut } } as never,
    depth: 0,
    overrideAccess: true,
    // Two times changed; nothing for the translator to do.
    context: { skipAutoTranslate: true },
  })
  return json({ ok: true })
})
