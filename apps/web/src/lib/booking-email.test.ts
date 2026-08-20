import { describe, expect, it } from 'vitest'
import {
  bookingConfirmationContent,
  bookingOutcomeContent,
  outcomeFor,
  venueCancellationContent,
} from './booking-email'

/**
 * The confirmation email.
 *
 * Often the first message anyone receives from Vardenia, which makes it the one
 * that decides whether the next lands in an inbox or a junk folder. The tests
 * that matter are about the two things that would make it wrong rather than
 * merely plain: a time shown in the wrong zone, and a "confirmed" sent for a
 * booking that is only requested.
 */

const BASE = {
  name: 'Sami Khoury',
  reference: '7VTXR24B',
  // 19:00 UTC on 1 March 2027. Beirut is UTC+2 in March, so 21:00 local.
  start: new Date('2027-03-01T19:00:00.000Z'),
  end: new Date('2027-03-01T21:00:00.000Z'),
  partySize: 4,
  locale: 'en' as const,
}

describe('a confirmed booking', () => {
  const content = bookingConfirmationContent({ ...BASE, status: 'confirmed' })!

  it('says it is confirmed', () => {
    expect(content.subject).toMatch(/confirmed/i)
    expect(content.text).toMatch(/confirmed/i)
  })

  it('carries the reference, which is the whole receipt', () => {
    expect(content.text).toContain('7VTXR24B')
    expect(content.html).toContain('7VTXR24B')
  })

  /**
   * The one that is wrong in a way the reader cannot detect. The instant is
   * stored in UTC and the customer is standing in Lebanon; a confirmation
   * saying 19:00 for a 21:00 table looks entirely plausible.
   */
  it('shows the time in Beirut, not UTC', () => {
    expect(content.text).toContain('21:00')
    expect(content.text).not.toMatch(/\b19:00\b/)
  })

  it('has a plain-text part as well as HTML', () => {
    expect(content.text.length).toBeGreaterThan(40)
    expect(content.text).not.toContain('<')
    expect(content.html).toContain('<!doctype html>')
  })

  /**
   * A message whose only content is a link is the shape of phishing, and there
   * is nothing to click yet in any case - no booking management page exists.
   */
  it('contains no links at all', () => {
    expect(content.html).not.toMatch(/<a\s/i)
    expect(content.text).not.toMatch(/https?:\/\//)
  })

  it('names the party size', () => {
    expect(content.text).toContain('4')
  })
})

describe('a pending booking', () => {
  const content = bookingConfirmationContent({ ...BASE, status: 'pending' })!

  /**
   * The distinction the whole status model exists for. Telling somebody their
   * table is confirmed when the venue has not agreed is how a person arrives to
   * no table, holding an email that says otherwise.
   */
  it('never claims to be confirmed', () => {
    expect(content.subject).not.toMatch(/\bconfirmed\b/i)
    expect(content.text).not.toMatch(/booking confirmed/i)
    expect(content.html).not.toMatch(/booking confirmed/i)
  })

  it('says plainly that nothing is reserved yet', () => {
    expect(content.text).toMatch(/nothing is reserved yet/i)
  })
})

describe('Arabic', () => {
  const content = bookingConfirmationContent({ ...BASE, status: 'confirmed', locale: 'ar' })!

  it('is written in Arabic', () => {
    expect(content.subject).toMatch(/[؀-ۿ]/)
    expect(content.text).toMatch(/[؀-ۿ]/)
  })

  it('sets the document direction to right-to-left', () => {
    expect(content.html).toContain('dir="rtl"')
    expect(content.html).toContain('lang="ar"')
  })

  it('still carries the reference unchanged', () => {
    expect(content.text).toContain('7VTXR24B')
  })
})

describe('statuses that are not written about', () => {
  /**
   * Nothing is sent for a cancelled, completed or no-show booking. Those need
   * their own message with their own wording, and quietly reusing the
   * confirmation would tell somebody their cancelled table is booked.
   */
  it.each(['cancelled', 'completed', 'no-show'] as const)('returns null for %s', (status) => {
    expect(bookingConfirmationContent({ ...BASE, status })).toBeNull()
  })
})

describe('escaping', () => {
  /** A name is user input and lands inside HTML. */
  it('escapes a name that contains markup', () => {
    const content = bookingConfirmationContent({
      ...BASE,
      status: 'confirmed',
      name: '<script>alert(1)</script>',
    })!
    expect(content.html).not.toContain('<script>')
    expect(content.html).toContain('&lt;script&gt;')
  })
})

/**
 * What we write when the business answers.
 *
 * The wording carries a factual claim in each case - whether anything was ever
 * reserved - and getting that wrong is worse than saying nothing. A declined
 * request was never held; a cancelled booking was.
 */
describe('outcomeFor', () => {
  it('treats cancelling a pending request as a decline', () => {
    expect(outcomeFor('pending', 'cancelled')).toBe('declined')
  })

  it('treats cancelling a confirmed booking as a cancellation', () => {
    expect(outcomeFor('confirmed', 'cancelled')).toBe('cancelled')
  })

  it('writes about a confirmation', () => {
    expect(outcomeFor('pending', 'confirmed')).toBe('confirmed')
  })

  /**
   * Nobody needs an email saying they turned up, and "you did not turn up" is an
   * accusation made from a button pressed at the end of a shift.
   */
  it.each([
    ['confirmed', 'completed'],
    ['confirmed', 'no-show'],
  ] as const)('says nothing about %s -> %s', (from, to) => {
    expect(outcomeFor(from, to)).toBeNull()
  })

  it('says nothing when the status did not change', () => {
    expect(outcomeFor('confirmed', 'confirmed')).toBeNull()
    expect(outcomeFor('pending', 'pending')).toBeNull()
  })
})

describe('bookingOutcomeContent', () => {
  const base = {
    name: 'Sami',
    reference: 'ABCD1234',
    start: new Date('2026-09-01T17:00:00Z'),
    end: new Date('2026-09-01T19:00:00Z'),
    partySize: 2,
    locale: 'en' as const,
  }

  it('tells a declined customer that nothing was reserved', () => {
    const mail = bookingOutcomeContent({ ...base, outcome: 'declined' })
    expect(mail.text).toContain('nothing has been reserved')
    expect(mail.subject).not.toContain('confirmed')
  })

  it('does not tell a cancelled customer their booking was never held', () => {
    const mail = bookingOutcomeContent({ ...base, outcome: 'cancelled' })
    expect(mail.text).not.toContain('nothing has been reserved')
  })

  it.each(['confirmed', 'declined', 'cancelled'] as const)(
    'puts the reference in both parts for %s',
    (outcome) => {
      const mail = bookingOutcomeContent({ ...base, outcome })
      expect(mail.text).toContain('ABCD1234')
      expect(mail.html).toContain('ABCD1234')
    },
  )

  it.each(['confirmed', 'declined', 'cancelled'] as const)(
    'writes %s in Arabic without falling back to English',
    (outcome) => {
      const mail = bookingOutcomeContent({ ...base, outcome, locale: 'ar' })
      expect(mail.html).toContain('dir="rtl"')
      expect(/[؀-ۿ]/.test(mail.subject)).toBe(true)
      expect(/[؀-ۿ]/.test(mail.text)).toBe(true)
    },
  )

  it('shows the time in Beirut, not in UTC', () => {
    const mail = bookingOutcomeContent({ ...base, outcome: 'confirmed' })
    expect(mail.text).toContain('20:00')
  })
})

/**
 * What the venue is told, which turns on one fact: was the table actually held?
 *
 * A confirmed booking freed a table. A pending one was only ever a request the
 * venue had not answered. Telling them a table is free when they never knew they
 * had lost one is telling them something untrue about their own evening.
 */
describe('venueCancellationContent', () => {
  const base = {
    businessName: 'Le Royal',
    guestName: 'Sami',
    reference: 'ABCD1234',
    start: new Date('2026-09-01T17:00:00Z'),
    partySize: 2,
  }

  it('says a table is free again when the booking was confirmed', () => {
    const mail = venueCancellationContent({ ...base, wasConfirmed: true })
    expect(mail.subject).toContain('Booking cancelled')
    expect(mail.text).toContain('that table is free again')
  })

  it('says only that a request was withdrawn when it never was', () => {
    const mail = venueCancellationContent({ ...base, wasConfirmed: false })
    expect(mail.subject).toContain('withdrawn')
    expect(mail.text).not.toContain('table is free')
    expect(mail.text).toContain('nothing to answer')
  })

  it('carries what the venue needs to find the booking', () => {
    const mail = venueCancellationContent({ ...base, wasConfirmed: true })
    expect(mail.text).toContain('ABCD1234')
    expect(mail.text).toContain('Sami')
    expect(mail.text).toContain('Le Royal')
    // In Beirut, not UTC.
    expect(mail.text).toContain('20:00')
  })

  it('links to the dashboard, since that is where they act on it', () => {
    expect(venueCancellationContent({ ...base, wasConfirmed: true }).text).toContain('/partner')
  })

  it('is written in both languages, because we never asked the venue', () => {
    const mail = venueCancellationContent({ ...base, wasConfirmed: true })
    expect(mail.html).toContain('dir="rtl"')
    expect(/[؀-ۿ]/.test(mail.text)).toBe(true)
  })

  it('renders a booking whose guest record has gone', () => {
    const mail = venueCancellationContent({ ...base, guestName: '', wasConfirmed: true })
    expect(mail.text).toContain('Guest')
  })

  it('does not let a guest name inject markup', () => {
    const mail = venueCancellationContent({
      ...base,
      guestName: '<script>alert(1)</script>',
      wasConfirmed: true,
    })
    expect(mail.html).not.toContain('<script>')
  })
})
