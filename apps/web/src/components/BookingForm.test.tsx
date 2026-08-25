import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from '@vardenia/i18n/messages'
import type { Locale } from '@vardenia/i18n'
import { BookingForm } from './BookingForm'
import { bookingFormModel } from '../lib/booking-form'
import type { BookingRules } from '../lib/availability'

/**
 * The form as it first paints.
 *
 * What is being checked is that the model reaches the markup: a hotel must not
 * render a time field, a restaurant must not ask for nights, and the bounds a
 * listing configured have to end up on the inputs rather than being decoration
 * on the object. Those are the failures that survive a click-through, because
 * the wrong form still submits and the endpoint still answers.
 *
 * Static markup, so the effect that corrects the date floor does not run - which
 * is the point. This is what a reader sees before hydration and what a crawler
 * would see: it has to be right on its own.
 */

const NOW = new Date('2026-09-01T09:00:00Z')

const restaurant: BookingRules = {
  enabled: true,
  minPartySize: 2,
  maxPartySize: 8,
  leadTimeMinutes: 120,
  maxAdvanceDays: 60,
  minDurationMinutes: 90,
  maxDurationMinutes: 180,
}

const hotel: BookingRules = {
  enabled: true,
  minPartySize: 1,
  maxPartySize: 4,
  leadTimeMinutes: 1440,
  maxAdvanceDays: 365,
  minDurationMinutes: 1440,
  maxDurationMinutes: 1440 * 7,
}

/**
 * `timeZone` is passed because the real provider inherits it from the request
 * config (i18n/request.ts sets Asia/Beirut) and next-intl warns loudly without
 * it. Leaving the warning in place would train us to read past it, and the day
 * it means something we would.
 */
const render = (rules: BookingRules, locale: Locale = 'en') =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={getMessages(locale)} timeZone="Asia/Beirut">
      <BookingForm businessId={42} model={bookingFormModel(rules, NOW)} locale={locale} />
    </NextIntlClientProvider>,
  )

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

describe('BookingForm', () => {
  it('asks a restaurant customer for a time and a length', () => {
    const html = render(restaurant)
    expect(html).toContain('type="time"')
    expect(html).toContain('1 hour 30 minutes')
    expect(text(html)).not.toContain('nights')
  })

  it('asks a hotel customer for nights and never for a time', () => {
    const html = render(hotel)
    expect(html).not.toContain('type="time"')
    expect(text(html)).toContain('night')
  })

  it('puts the listing bounds on the date input', () => {
    const html = render(restaurant)
    // Two hours' notice does not remove today.
    expect(html).toContain('min="2026-09-01"')
    expect(html).toContain('max="2026-10-31"')
  })

  it('puts the party bounds on the number input', () => {
    const html = render(restaurant)
    expect(html).toContain('min="2"')
    expect(html).toContain('max="8"')
  })

  it('warns about notice only when there is meaningful notice to give', () => {
    expect(text(render(restaurant))).toContain('at least 2 hours of notice')
    expect(text(render({ ...restaurant, leadTimeMinutes: 15 }))).not.toContain('of notice')
  })

  /**
   * "at least 1 hours of notice" is what a template with the number spliced in
   * produces, and a listing with an hour's lead time is the commonest setting
   * there is - so the first thing most readers would see was a typo.
   */
  it('says hour rather than hours for a single hour of notice', () => {
    const html = text(render({ ...restaurant, leadTimeMinutes: 60 }))
    expect(html).toContain('at least 1 hour of notice')
    expect(html).not.toContain('1 hours')
  })

  /**
   * What a prerendered listing page ships.
   *
   * There is no session on the server and no cookie during a static render, so
   * the signed-out state is what every reader receives first - including one
   * who is signed in, until the browser reads the hint and corrects it. It has
   * to be the safe state: an account prompt rather than a form that would be
   * refused on submit.
   */
  it('asks for an account rather than offering a form nobody can submit', () => {
    const rendered = text(render(restaurant))
    expect(rendered).toContain('You need a Vardenia account to book')
    expect(rendered).toContain('Create an account')
  })

  /** The two fields that moved to the account must not come back. */
  it('no longer collects a name or an email address', () => {
    const html = render(restaurant)
    expect(html).not.toContain('autoComplete="email"')
    expect(html).not.toContain('autocomplete="email"')
    expect(html).not.toContain('autocomplete="name"')
  })

  /** Signing in has to return the reader to the listing, not to their account. */
  it('carries the reader back to this listing after signing in', () => {
    expect(render(restaurant)).toContain('next=')
  })

  /**
   * Every input has a label bound to it by id, and no id is a bare string that
   * could collide with another form on the page - `useId` supplies the prefix.
   */
  it('labels every input', () => {
    const html = render(restaurant)
    const labels = html.match(/<label[^>]*for="([^"]+)"/g) ?? []
    expect(labels.length).toBeGreaterThanOrEqual(6)

    for (const label of labels) {
      const id = /for="([^"]+)"/.exec(label)?.[1]
      expect(html).toContain(`id="${id}"`)
    }
  })

  it('renders in Arabic without leaking English', () => {
    const html = text(render(restaurant, 'ar'))
    // The account prompt is what a signed-out reader sees, so that is the
    // string that has to be translated - the submit button is not rendered.
    expect(html).not.toContain('You need a Vardenia account')
    expect(html).toContain('تحتاج إلى حساب')
  })
})
