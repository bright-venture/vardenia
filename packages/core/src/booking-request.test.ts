import { describe, expect, it } from 'vitest'
import {
  availabilityQuerySchema,
  bookingRequestSchema,
  fieldErrors,
  resetPasswordSchema,
  signupSchema,
} from './booking-request'

/**
 * The shape of a booking request.
 *
 * This decides whether a request is worth asking about - not whether the table
 * is free. Keeping those apart is what lets a form say "that is not an email"
 * and "that table is taken" as different things, instead of one shrug.
 */

const VALID = {
  business: '7',
  start: '2027-03-01T19:00:00.000Z',
  end: '2027-03-01T21:00:00.000Z',
  partySize: 2,
  name: 'Sami Khoury',
  email: 'sami@example.com',
}

describe('bookingRequestSchema', () => {
  it('accepts a complete request', () => {
    expect(bookingRequestSchema.safeParse(VALID).success).toBe(true)
  })

  it('accepts a numeric business id as well as a string', () => {
    expect(bookingRequestSchema.safeParse({ ...VALID, business: 7 }).success).toBe(true)
  })

  /** A form posts strings. Refusing "2" would mean every caller coercing by hand. */
  it('coerces a party size sent as text', () => {
    const parsed = bookingRequestSchema.parse({ ...VALID, partySize: '4' })
    expect(parsed.partySize).toBe(4)
  })

  it.each([0, -1, 1.5, 501])('refuses a party size of %o', (partySize) => {
    expect(bookingRequestSchema.safeParse({ ...VALID, partySize }).success).toBe(false)
  })

  /**
   * The address is the key a returning customer is matched on, so `Sami@` and
   * `sami@` have to be the same person or they end up with two records and half
   * their bookings in each.
   */
  it('lowercases and trims the email', () => {
    const parsed = bookingRequestSchema.parse({ ...VALID, email: '  Sami@Example.COM  ' })
    expect(parsed.email).toBe('sami@example.com')
  })

  /**
   * Deliberately loose. Refusing a real address costs a customer who cannot
   * book; letting a typo through costs a confirmation they notice is missing.
   */
  it('accepts addresses a stricter validator would refuse', () => {
    for (const email of ['a+tag@example.com', 'name@sub.domain.co.uk', "o'brien@example.com"]) {
      expect(bookingRequestSchema.safeParse({ ...VALID, email }).success, email).toBe(true)
    }
  })

  it.each(['', 'sami', 'sami@', '@example.com', 'sami@example', 'a b@example.com'])(
    'refuses %o as an email',
    (email) => {
      expect(bookingRequestSchema.safeParse({ ...VALID, email }).success).toBe(false)
    },
  )

  it.each(['', 'not a date', '2027-13-45'])('refuses %o as a start time', (start) => {
    expect(bookingRequestSchema.safeParse({ ...VALID, start }).success).toBe(false)
  })

  /**
   * Not the schema's job. An end before a start is a real booking problem, but
   * it belongs to checkAvailability, which can say "those dates do not make
   * sense" alongside every other reason rather than failing as a bad field.
   */
  it('leaves an end before the start to the availability check', () => {
    const backwards = { ...VALID, start: VALID.end, end: VALID.start }
    expect(bookingRequestSchema.safeParse(backwards).success).toBe(true)
  })

  it('requires a name', () => {
    expect(bookingRequestSchema.safeParse({ ...VALID, name: '   ' }).success).toBe(false)
  })

  /** Lebanese numbers are written half a dozen ways; a strict regex rejects real ones. */
  it.each(['+961 3 123456', '03123456', '00961 70 111 222', undefined])(
    'accepts %o as a phone',
    (phone) => {
      expect(bookingRequestSchema.safeParse({ ...VALID, phone }).success).toBe(true)
    },
  )

  it('caps notes rather than storing an essay', () => {
    expect(bookingRequestSchema.safeParse({ ...VALID, notes: 'x'.repeat(1001) }).success).toBe(
      false,
    )
    expect(bookingRequestSchema.safeParse({ ...VALID, notes: 'Window table' }).success).toBe(true)
  })

  it('accepts only the two locales we write in', () => {
    expect(bookingRequestSchema.safeParse({ ...VALID, locale: 'ar' }).success).toBe(true)
    expect(bookingRequestSchema.safeParse({ ...VALID, locale: 'fr' }).success).toBe(false)
  })

  /** Extra keys are dropped, so a caller cannot smuggle a status or a reference. */
  it('ignores fields it does not know about', () => {
    const parsed = bookingRequestSchema.parse({
      ...VALID,
      status: 'confirmed',
      reference: 'FORGED01',
      customer: 99,
    })
    expect(parsed).not.toHaveProperty('status')
    expect(parsed).not.toHaveProperty('reference')
    expect(parsed).not.toHaveProperty('customer')
  })
})

describe('availabilityQuerySchema', () => {
  it('accepts what a query string actually contains', () => {
    const parsed = availabilityQuerySchema.safeParse({
      business: '7',
      start: VALID.start,
      end: VALID.end,
      partySize: '2',
    })
    expect(parsed.success).toBe(true)
  })

  it('does not ask for the personal details a lookup has no use for', () => {
    const parsed = availabilityQuerySchema.parse({
      business: '7',
      start: VALID.start,
      end: VALID.end,
      partySize: 2,
    })
    expect(parsed).not.toHaveProperty('email')
    expect(parsed).not.toHaveProperty('name')
  })
})

describe('fieldErrors', () => {
  /**
   * One reason per field. A form that says "required" and "too long" about the
   * same empty box reads as broken.
   */
  it('reports the first problem per field, keyed for a form', () => {
    const result = bookingRequestSchema.safeParse({ ...VALID, email: 'nope', name: '' })
    expect(result.success).toBe(false)
    if (result.success) return

    const errors = fieldErrors(result.error)
    expect(Object.keys(errors).sort()).toEqual(['email', 'name'])
    expect(typeof errors.email).toBe('string')
  })
})

describe('signupSchema', () => {
  const VALID_SIGNUP = {
    name: 'Sami Khoury',
    email: 'sami@example.com',
    password: 'correct horse battery',
  }

  it('accepts a normal sign-up', () => {
    expect(signupSchema.safeParse(VALID_SIGNUP).success).toBe(true)
  })

  /**
   * The same loose email rule as a booking, and it has to stay that way. If the
   * two disagreed, somebody could book as a guest with an address the sign-up
   * form then refuses, and never be able to claim the record holding their
   * bookings.
   */
  it('accepts every address a booking would', () => {
    for (const email of ['a+tag@example.com', 'name@sub.domain.co.uk', "o'brien@example.com"]) {
      expect(signupSchema.safeParse({ ...VALID_SIGNUP, email }).success, email).toBe(true)
      expect(
        bookingRequestSchema.safeParse({
          business: '7',
          start: '2027-03-01T19:00:00.000Z',
          end: '2027-03-01T21:00:00.000Z',
          partySize: 2,
          name: 'Sami',
          email,
        }).success,
        email,
      ).toBe(true)
    }
  })

  it('lowercases the email, so it matches an existing guest record', () => {
    expect(signupSchema.parse({ ...VALID_SIGNUP, email: 'SAMI@Example.com' }).email).toBe(
      'sami@example.com',
    )
  })

  /**
   * Length only. Composition rules push people towards `Password1!`, which is
   * weaker in practice than a long passphrase - which is why the guidelines that
   * used to demand them stopped.
   */
  it('requires length rather than punctuation', () => {
    expect(signupSchema.safeParse({ ...VALID_SIGNUP, password: 'Pw1!' }).success).toBe(false)
    expect(signupSchema.safeParse({ ...VALID_SIGNUP, password: 'a'.repeat(10) }).success).toBe(true)
    expect(
      signupSchema.safeParse({ ...VALID_SIGNUP, password: 'all lowercase words here' }).success,
    ).toBe(true)
  })

  /** Ten spaces is ten characters and no password at all. */
  it('refuses a password of whitespace', () => {
    expect(signupSchema.safeParse({ ...VALID_SIGNUP, password: '          ' }).success).toBe(false)
  })

  /** Nothing here should let a caller grant itself anything. */
  it('ignores fields it does not know about', () => {
    const parsed = signupSchema.parse({ ...VALID_SIGNUP, roles: ['admin'], _verified: true })
    expect(parsed).not.toHaveProperty('roles')
    expect(parsed).not.toHaveProperty('_verified')
  })
})

/**
 * Reset shares the sign-up password rule on purpose. A floor that applies to one
 * and not the other is not a floor: anybody could sign up, immediately reset,
 * and land below it.
 */
describe('resetPasswordSchema', () => {
  const valid = { token: 'a'.repeat(40), password: 'a-long-enough-one' }

  it('accepts a token and a password', () => {
    expect(resetPasswordSchema.safeParse(valid).success).toBe(true)
  })

  it('applies the same password floor as sign-up', () => {
    expect(resetPasswordSchema.safeParse({ ...valid, password: 'short' }).success).toBe(false)
    expect(resetPasswordSchema.safeParse({ ...valid, password: '           ' }).success).toBe(false)
  })

  it('refuses a token too short to be one', () => {
    expect(resetPasswordSchema.safeParse({ ...valid, token: 'abc' }).success).toBe(false)
  })

  /**
   * No email field, and this is the assertion that matters. Accepting one would
   * let a caller aim a valid token at a different account.
   */
  it('ignores an email even when one is sent', () => {
    const parsed = resetPasswordSchema.safeParse({ ...valid, email: 'someone@else.com' })
    expect(parsed.success).toBe(true)
    expect(parsed.success && 'email' in parsed.data).toBe(false)
  })
})
