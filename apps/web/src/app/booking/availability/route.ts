import { getPayload } from 'payload'
import { availabilityQuerySchema, fieldErrors } from '@vardenia/core'
import config from '../../../payload.config'
import { checkAvailability, unavailableMessage } from '../../../lib/availability'
import { overlappingBookings } from '../../../lib/booking-service'
import { withRateLimit } from '../../../lib/rate-limit'

/**
 * Is this slot bookable?
 *
 * Read-only, and deliberately not the thing that reserves anything. A pass here
 * means "worth submitting", never "held for you" - the slot can be taken between
 * this call and the booking, which is what the capacity trigger exists for. A UI
 * that treats this as a reservation will disappoint somebody.
 *
 * Not under /api: Payload owns /api/[...slug], so a route there would either
 * collide with a collection or be swallowed by its catch-all. This follows the
 * convention already set by /g, /qr and /reports.
 *
 * Rate-limited because it is a free lookup against the database, and an
 * unlimited one is an invitation to enumerate a business's whole calendar.
 */

export const dynamic = 'force-dynamic'

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store' } })

export const GET = withRateLimit(async (request: Request) => {
  const url = new URL(request.url)

  const parsed = availabilityQuerySchema.safeParse({
    business: url.searchParams.get('business') ?? '',
    start: url.searchParams.get('start') ?? '',
    end: url.searchParams.get('end') ?? '',
    partySize: url.searchParams.get('partySize') ?? '',
  })

  if (!parsed.success) {
    return json({ ok: false, errors: fieldErrors(parsed.error) }, 400)
  }

  const { business: businessId, start: startIso, end: endIso, partySize } = parsed.data
  const start = new Date(startIso)
  const end = new Date(endIso)

  const payload = await getPayload({ config })

  const business = await payload
    .findByID({
      collection: 'businesses',
      id: businessId as string,
      depth: 0,
      overrideAccess: true,
    })
    .catch(() => null)

  /**
   * A draft listing answers exactly as a missing one does. Anything else lets a
   * caller enumerate unpublished listings by watching which ids reply
   * differently - the listings we have not decided to show yet.
   */
  if (!business || (business as { _status?: string })._status === 'draft') {
    return json({ ok: false, reason: 'not-found', message: 'That listing is not available.' }, 404)
  }

  const existing = await overlappingBookings(payload, business.id, start, end)

  const verdict = checkAvailability({
    rules: (business as { booking?: never }).booking,
    hours: (business as { openingHours?: never }).openingHours,
    existing,
    request: { interval: { start, end }, partySize },
  })

  if (verdict.ok) return json({ ok: true })

  /**
   * `detail` carries numbers the form can use - the minimum notice, the largest
   * party - so it can say "this place needs two hours' notice" rather than
   * repeating a generic refusal. It never carries how many places are left,
   * which would tell a competitor how full a restaurant is.
   */
  return json({
    ok: false,
    reason: verdict.reason,
    message: unavailableMessage(verdict.reason),
    ...(verdict.detail && verdict.reason !== 'at-capacity' ? { detail: verdict.detail } : {}),
  })
})
