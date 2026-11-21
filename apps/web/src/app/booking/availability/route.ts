import { getPayload } from 'payload'
import {
  availabilityQuerySchema,
  canHaveRoomTypes,
  fieldErrors,
  seatingAreasOf,
} from '@vardenia/core'
import { LOCALES, type Locale } from '@vardenia/i18n'
import config from '../../../payload.config'
import { checkAvailability, unavailableMessage } from '../../../lib/availability'
import { parseRoomsParam, quoteJson, roomQuote, stayQuote } from '../../../lib/booking-price'
import { beirutDate } from '../../../lib/beirut'
import { roomStayInterval, stayNights } from '../../../lib/room-availability'
import { roomTypesFor } from '../../../lib/room-booking'
import { closedPeriods, overlappingBookings } from '../../../lib/booking-service'
import {
  checkStayRequest,
  isWholeProperty,
  stayConfigOf,
  stayInterval,
} from '../../../lib/stay-booking'
import { withRateLimit } from '../../../lib/rate-limit'
import { anyAreaVerdict, areaAvailability, checkSeatingRequest } from '../../../lib/seating-booking'

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
    children: url.searchParams.get('children') ?? undefined,
    packageId: url.searchParams.get('packageId') || undefined,
    area: url.searchParams.get('area') || undefined,
  })
  const lang = url.searchParams.get('locale') ?? 'en'
  const locale: Locale = (LOCALES as readonly string[]).includes(lang) ? (lang as Locale) : 'en'

  if (!parsed.success) {
    return json({ ok: false, errors: fieldErrors(parsed.error) }, 400)
  }

  const { business: businessId, start: startIso, end: endIso, partySize } = parsed.data
  let start = new Date(startIso)
  let end = new Date(endIso)

  const payload = await getPayload({ config })

  const business = await payload
    .findByID({
      collection: 'businesses',
      id: businessId as string,
      depth: 0,
      overrideAccess: true,
      // Seating area labels in the reader's language (Task 8).
      locale,
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

  /*
   * A guest house is checked as the booking service books it: the whole
   * property from check-in to check-out (lib/stay-booking, Task 6).
   */
  const wholeProperty = isWholeProperty(business)
  if (wholeProperty) {
    const interval = stayInterval(start, end, (business as { booking?: never }).booking)
    if (interval) ({ start, end } = interval)
  }

  /*
   * The days the venue has said it is shut, read the way the booking guard reads
   * them (hooks/guardBookingWrite). Without them this answered "free" for a
   * closed day, and the guest only learned otherwise when the booking itself was
   * refused. Access overridden: a guest cannot read the Closures collection, and
   * only the verdict leaves this route.
   */
  const [existing, closures] = await Promise.all([
    overlappingBookings(payload, business.id, start, end),
    closedPeriods(payload, business.id, start, end),
  ])

  const children = Math.max(0, Math.min(parsed.data.children ?? 0, partySize - 1))

  /*
   * A restaurant with seating areas (Task 8, lib/seating-booking): every area
   * answered for this time, with its tables and how many of them overlapping
   * bookings hold (asked for by the tech lead, so the form can show which
   * areas are free). The top-level verdict is the area sent, else free when
   * any area is. The general reasons (closed, too soon, party size) come
   * first, as always.
   */
  const areas = wholeProperty ? [] : seatingAreasOf(business as never)
  const seatingCheck = {
    rules: (business as { booking?: never }).booking,
    hours: (business as { openingHours?: never }).openingHours,
    closures,
    existing,
    areas,
    request: { interval: { start, end }, partySize },
  }
  const perArea = areas.length > 0 ? { areas: areaAvailability(seatingCheck) } : {}

  const verdict = wholeProperty
    ? checkStayRequest({
        rules: (business as { booking?: never }).booking,
        closures,
        existing,
        stay: stayConfigOf(business),
        request: { interval: { start, end }, adults: partySize - children, children },
      })
    : areas.length > 0
      ? parsed.data.area
        ? checkSeatingRequest({ ...seatingCheck, area: parsed.data.area })
        : anyAreaVerdict(seatingCheck)
      : checkAvailability({
          rules: (business as { booking?: never }).booking,
          hours: (business as { openingHours?: never }).openingHours,
          closures,
          existing,
          request: { interval: { start, end }, partySize },
        })

  /*
   * The price the booking would store (Task 7), from the same functions the
   * booking service uses (lib/booking-price), so the page shows the total
   * before booking. A guest house: its stay quote, with the package asked
   * for. A hotel: the rooms named in `rooms` ("type:count:option,..."), the
   * nights counted as the service counts them. Never a restaurant. A refusal
   * comes as its reason and wording; 'no-price' does not stop a booking.
   */
  const subcategories = (business as { subcategories?: string[] | null }).subcategories ?? []
  let quote: ReturnType<typeof quoteJson> | undefined
  if (wholeProperty) {
    quote = quoteJson(
      stayQuote({
        stay: stayConfigOf(business),
        nights: stayNights(start, end).length,
        partySize,
        children: parsed.data.children,
        packageId: parsed.data.packageId,
      }),
      locale,
    )
  } else if (canHaveRoomTypes(subcategories) && url.searchParams.get('rooms') !== null) {
    const selection = parseRoomsParam(url.searchParams.get('rooms'))
    const nights = stayNights(start, end).length
    const interval = roomStayInterval(
      beirutDate(start),
      nights,
      (business as { booking?: never }).booking,
    )
    if (!selection || !interval) {
      quote = quoteJson({ ok: false, reason: 'invalid-input' }, locale)
    } else {
      const typesBy = await roomTypesFor(payload, [Number(business.id)], { locale })
      quote = quoteJson(
        roomQuote(
          typesBy.get(Number(business.id)) ?? [],
          selection,
          stayNights(interval.start, interval.end).length,
        ),
        locale,
      )
    }
  }
  const priced = quote ? { quote } : {}

  if (verdict.ok) return json({ ok: true, ...priced, ...perArea })

  /**
   * `detail` carries numbers the form can use - the minimum notice, the largest
   * party - so it can say "this place needs two hours' notice" rather than
   * repeating a generic refusal. It never carries how many places are left,
   * which would tell a competitor how full a restaurant is - except `areas`
   * at a restaurant with seating areas (Task 8), where the tech lead asked
   * for each area's tables and how many are taken.
   */
  return json({
    ok: false,
    reason: verdict.reason,
    message: unavailableMessage(verdict.reason),
    ...(verdict.detail && verdict.reason !== 'at-capacity' ? { detail: verdict.detail } : {}),
    ...priced,
    ...perArea,
  })
})
