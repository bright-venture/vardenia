import { headers as nextHeaders } from 'next/headers'
import { getPayload } from 'payload'
import { getTranslations } from 'next-intl/server'
import { generateBookingReference, staffRoleForSlug } from '@vardenia/core'
import { LOCALES, type Locale } from '@vardenia/i18n'
import config from '../../../payload.config'
import { CUSTOMER_COLLECTION } from '../../../access/index'
import { isCalendarDay } from '../../../lib/availability'
import { beirutDate } from '../../../lib/beirut'
import { RATE_LIMIT, withRateLimit } from '../../../lib/rate-limit'
import { reportError } from '../../../lib/report'
import { EVENT_TYPES } from '../../../collections/StaffRequests'

/**
 * A guest asks the Vardenia team for hostesses or waiters (18 November 2026).
 *
 * The only way a staff request is made. Like a booking it needs a signed-in
 * customer with a verified address, and the name and email come from the
 * account, not the form. The team is emailed by the collection's own hook; the
 * guest gets a copy here, in their language. Neither email can undo the
 * request.
 */

export const dynamic = 'force-dynamic'

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store' } })

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const text = (value: unknown, max: number) =>
  typeof value === 'string' ? value.trim().slice(0, max) : ''
const whole = (value: unknown, min: number, max: number) => {
  const n = Number(value)
  return Number.isInteger(n) && n >= min && n <= max ? n : null
}

export const POST = withRateLimit(
  async (request: Request) => {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) return json({ ok: false, message: 'Expected a JSON body.' }, 400)

    const payload = await getPayload({ config })
    const auth = await payload
      .auth({ headers: await nextHeaders() })
      .catch(() => ({ user: null }) as { user: null })
    const customer = auth.user
    if (!customer || customer.collection !== CUSTOMER_COLLECTION) {
      return json({ ok: false, code: 'signed-out' }, 401)
    }
    if (!customer._verified) return json({ ok: false, code: 'unverified' }, 403)

    const lang = text(body.locale, 5)
    const locale: Locale = (LOCALES as readonly string[]).includes(lang) ? (lang as Locale) : 'en'
    const t = await getTranslations({ locale, namespace: 'eventStaff' })

    const role = staffRoleForSlug(text(body.role, 20))
    const eventType = text(body.eventType, 30)
    const guests = whole(body.guests, 1, 5000)
    const eventDate = text(body.eventDate, 10)
    const startTime = text(body.startTime, 5)
    const hours = body.hours === '' || body.hours == null ? null : whole(body.hours, 1, 24)
    const staffWanted =
      body.staffWanted === '' || body.staffWanted == null ? null : whole(body.staffWanted, 1, 500)
    const venue = text(body.venue, 200)

    const valid =
      role &&
      (EVENT_TYPES as readonly string[]).includes(eventType) &&
      guests !== null &&
      isCalendarDay(eventDate) &&
      eventDate >= beirutDate() &&
      (!startTime || TIME.test(startTime)) &&
      venue.length > 1
    if (!valid) return json({ ok: false, message: t('error') }, 400)

    const reference = generateBookingReference()
    const name = String(customer.name ?? '').trim() || String(customer.email)
    const email = String(customer.email)
    const phone = text(body.phone, 40)

    try {
      await payload.create({
        collection: 'staff-requests',
        overrideAccess: true,
        data: {
          reference,
          role: role.slug,
          status: 'new',
          customer: Number(customer.id),
          name,
          email,
          ...(phone ? { phone } : {}),
          eventType: eventType as (typeof EVENT_TYPES)[number],
          guests,
          ...(staffWanted ? { staffWanted } : {}),
          eventDate,
          ...(startTime ? { startTime } : {}),
          ...(hours ? { hours } : {}),
          venue,
          ...(text(body.notes, 1000) ? { notes: text(body.notes, 1000) } : {}),
          locale,
        },
      })
    } catch (error) {
      await reportError(error, { source: 'staff-request', path: '/booking/staff-request' })
      return json({ ok: false, message: t('error') }, 500)
    }

    // The guest's copy. Never fails the request.
    try {
      const roleName = locale === 'ar' ? role.ar : role.en
      await payload.sendEmail({
        to: email,
        subject: t('emailSubject', { role: roleName }),
        text: [
          `${name},`,
          '',
          t('emailIntro'),
          '',
          `${t('reference')}: ${reference}`,
          `${t('date')}: ${eventDate}${startTime ? ` ${startTime}` : ''}`,
          `${t('guests')}: ${guests}`,
          `${t('venue')}: ${venue}`,
          '',
          'Vardenia',
        ].join('\n'),
      })
    } catch (error) {
      await reportError(error, { source: 'staff-request.email', extra: { reference } })
    }

    return json({ ok: true, reference, email }, 201)
  },
  RATE_LIMIT.WRITE_PER_WINDOW,
  // 20 a minute, counted in the database, like the other forms that write
  // something. It used the default of 300 a minute per server (21 November
  // 2026, authentication audit).
  { shared: true },
)
