import { getPayload } from 'payload'
import config from '../../../payload.config'
import { LOCALES, type Locale } from '@vardenia/i18n'
import { isCalendarDay, unavailableMessage, type BookingRules } from '../../../lib/availability'
import { closedPeriods } from '../../../lib/booking-service'
import { withRateLimit } from '../../../lib/rate-limit'
import {
  MAX_ROOMS_PER_BOOKING,
  checkRoomRequest,
  nightlyFree,
  roomStayInterval,
  roomsLeft,
} from '../../../lib/room-availability'
import { roomBookingsFor, roomTypesFor } from '../../../lib/room-booking'

/**
 * Which of a hotel's room types are free for some nights, and how many left.
 *
 * `GET /booking/rooms?business=12&date=2026-12-24&nights=2&guests=2`. What the
 * room list on a hotel's page asks when the guest picks dates (17 November
 * 2026). "Left" is capped at the most rooms one booking may hold, so the page
 * can say "2 left" like Booking.com without publishing a hotel's whole
 * occupancy. A hint, never a hold: the booking itself, and the database
 * trigger behind it, decide.
 */

export const dynamic = 'force-dynamic'

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store' } })

const whole = (raw: string | null, min: number, max: number, fallback: number) => {
  const n = Number(raw)
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback
}

export const GET = withRateLimit(async (request: Request) => {
  const url = new URL(request.url)
  const businessId = Number(url.searchParams.get('business'))
  const date = url.searchParams.get('date') ?? ''
  const nights = whole(url.searchParams.get('nights'), 1, 30, 1)
  const guests = whole(url.searchParams.get('guests'), 1, 50, 2)
  const lang = url.searchParams.get('locale') ?? 'en'
  const locale: Locale = (LOCALES as readonly string[]).includes(lang) ? (lang as Locale) : 'en'

  if (!Number.isInteger(businessId) || !isCalendarDay(date)) {
    return json({ ok: false, message: 'Choose a date.' }, 400)
  }

  const payload = await getPayload({ config })
  const business = await payload
    .findByID({ collection: 'businesses', id: businessId, depth: 0, overrideAccess: false })
    .catch(() => null)
  if (!business) return json({ ok: false, message: 'That listing is not available.' }, 404)

  const rules = (business as { booking?: BookingRules }).booking
  const interval = roomStayInterval(date, nights, rules)
  if (!interval) return json({ ok: false, message: 'Choose a date.' }, 400)

  const [typesBy, existingBy, closures] = await Promise.all([
    roomTypesFor(payload, [businessId]),
    roomBookingsFor(payload, [businessId], interval.start, interval.end),
    closedPeriods(payload, businessId, interval.start, interval.end),
  ])
  const types = typesBy.get(businessId) ?? []
  const existing = existingBy.get(businessId) ?? []

  // The hotel's own rules for these dates (closed, too soon, too far ahead).
  const general = checkRoomRequest({
    rules,
    closures,
    types: [{ id: -1, rooms: 1, sleepsAdults: 50, options: [], active: true }],
    existing: [],
    request: { interval, guests, lines: [{ roomType: -1, count: 1 }] },
  })

  return json({
    ok: true,
    checkIn: interval.start.toISOString(),
    checkOut: interval.end.toISOString(),
    ...(general.ok
      ? {}
      : { reason: general.reason, message: unavailableMessage(general.reason, locale) }),
    // Per night as well, so the page can say "13 Dec: 4 free, 14 to 19 Dec: 5".
    types: types.map((type) => ({
      id: type.id,
      left: general.ok ? Math.min(roomsLeft(type, existing, interval), MAX_ROOMS_PER_BOOKING) : 0,
      nights: general.ok
        ? nightlyFree(type, existing, interval).map(({ night, free }) => ({
            night,
            free: Math.min(free, MAX_ROOMS_PER_BOOKING),
          }))
        : [],
    })),
  })
})
