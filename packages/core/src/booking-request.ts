import { z } from 'zod'

/**
 * What a customer sends to ask for a booking.
 *
 * Lives in core rather than in the web app because the mobile app will post the
 * same shape, and a booking request validated two different ways is a booking
 * request validated once.
 *
 * # This describes the request, not the booking
 *
 * Nothing here decides whether the booking is possible - that is
 * `checkAvailability` and, finally, the database trigger. This only decides
 * whether the request is well-formed enough to be worth asking about. Keeping
 * those separate matters: "your email is not an email" and "that table is taken"
 * are different problems for the person filling in the form, and collapsing them
 * into one validation layer produces the kind of error message that says
 * `invalid_input` and helps nobody.
 */

/** ISO 8601, and a date the far end can actually parse. */
const isoDateTime = z
  .string()
  .min(1, 'required')
  .refine((value) => !Number.isNaN(Date.parse(value)), 'must be an ISO date and time')

/**
 * Deliberately loose, and lowercased.
 *
 * Zod's `.email()` rejects addresses that are legal and in use - anything with a
 * plus sign in some versions, newer TLDs, quoted locals. For a booking form the
 * cost of refusing a real address is a customer who cannot book, against the
 * benefit of catching a typo they will notice anyway when no confirmation
 * arrives. Lowercased because the address is the key a returning customer is
 * matched on, and `Sami@…` and `sami@…` are the same person.
 */
const emailAddress = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'required')
  .max(254, 'too long')
  .refine((value) => {
    const parts = value.split('@')
    if (parts.length !== 2) return false
    const [local, domain] = parts
    if (!local || !domain) return false
    return domain.includes('.') && !/\s/.test(value)
  }, 'must be an email address')

export const bookingRequestSchema = z.object({
  /** Which listing. Numeric id as a string or a number, since a form sends text. */
  business: z.union([z.string().min(1), z.number()]),

  start: isoDateTime,
  end: isoDateTime,

  partySize: z.coerce.number().int().min(1, 'at least one person').max(500, 'too many'),

  name: z.string().trim().min(1, 'required').max(120, 'too long'),
  email: emailAddress,

  /**
   * Optional, and not validated as a phone number.
   *
   * Lebanese numbers are written half a dozen ways - +961, 00961, 03, 70 - and a
   * regex strict enough to be useful rejects a third of them. The business rings
   * whatever is written here; a machine never parses it.
   */
  phone: z.string().trim().max(40).optional(),

  /** What the customer wants us to pass on: a dietary need, an anniversary. */
  notes: z.string().trim().max(1000, 'too long').optional(),

  /** Which language to write the confirmation in. */
  locale: z.enum(['en', 'ar']).optional(),
})

export type BookingRequest = z.infer<typeof bookingRequestSchema>

/** Query form of the same thing, for a read-only availability check. */
export const availabilityQuerySchema = z.object({
  business: z.union([z.string().min(1), z.number()]),
  start: isoDateTime,
  end: isoDateTime,
  partySize: z.coerce.number().int().min(1).max(500),
})

export type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>

/**
 * First error per field, in the shape a form can render.
 *
 * Zod's own flatten is close, but returns arrays: a field with two problems
 * shows both, and a form that says "required" and "too long" about the same
 * empty box reads as broken. One reason per field is what a person can act on.
 */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_'
    if (!(key in out)) out[key] = issue.message
  }
  return out
}
