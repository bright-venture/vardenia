import { describe, expect, it } from 'vitest'
import { bookingConfirmationContent } from './booking-email'

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
