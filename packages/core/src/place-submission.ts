import { z } from './zod'
import { LOCALE_CODES } from './locales'
import { LISTING_GOVERNORATES } from './listing-numbers'
import { GOVERNORATES } from './regions'
import { CONTACT_FIELDS, checkContactValue, normaliseContact, type ContactField } from './contact'
import { isSubmittableKind, type SubmittableKindSlug } from './taxonomy'

/**
 * What a business owner submits on the public "add your place" form.
 *
 * Shared by the server route and the client form. Unknown keys are stripped
 * (zod's default), and the server relies on that: a smuggled `tier` or
 * `_status` never reaches the record.
 */

export const PAGE_TEMPLATES = ['a', 'b', 'c'] as const

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

/**
 * The schema's own messages that the form tells apart (form-model errorKind
 * matches them exactly). English, never shown: the form translates by kind.
 */
export const SUBMISSION_EMAIL_MESSAGE = 'must be an email address'
export const SUBMISSION_TIME_MESSAGE = 'use 24-hour time like 09:00'
/** 24-hour HH:MM; "24:00" is allowed (closing at midnight). Same rule as the Businesses collection. */
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$|^24:00$/

/**
 * A blank text, time or number input submits '' (or null); for an optional
 * field that means "not given", so it becomes undefined before validation.
 */
const blankToUndefined = (value: unknown) =>
  value === null || (typeof value === 'string' && value.trim() === '') ? undefined : value

const hhmm = z.preprocess(
  blankToUndefined,
  z.string().trim().regex(TIME_RE, SUBMISSION_TIME_MESSAGE).optional(),
)

/** Same loose, lowercased rule as booking-request.ts. */
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
  }, SUBMISSION_EMAIL_MESSAGE)

/** Optional text: an empty string counts as absent. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, 'too long')
    .optional()
    .transform((v) => (v ? v : undefined))

/** A public contact value: blank is absent, otherwise valid and normalised (handles become URLs). */
const contactValue = (field: ContactField) =>
  z.preprocess(
    blankToUndefined,
    z
      .string()
      .trim()
      .superRefine((value, ctx) => {
        const verdict = checkContactValue(field, value)
        if (!verdict.ok) ctx.addIssue({ code: 'custom', message: verdict.message })
      })
      .transform((value) => normaliseContact(field, value) as string)
      .optional(),
  )

/**
 * The public contact group of a listing, every field optional and checked and
 * normalised with the listing's own rules (core contact). Unknown keys are
 * refused. Used by the partner branch request (core brand).
 */
export const contactInputSchema = z.strictObject(
  Object.fromEntries(CONTACT_FIELDS.map((field) => [field, contactValue(field)])) as Record<
    ContactField,
    ReturnType<typeof contactValue>
  >,
)

/** One day of a listing's opening hours, as the Businesses `openingHours` array stores it. */
export const openingHourShape = {
  day: z.enum(DAYS),
  opens: hhmm,
  closes: hhmm,
  closed: z.boolean(),
}

/** A listing's opening hours (unknown keys in a row are stripped, zod's default). */
export const openingHoursInputSchema = z.array(z.object(openingHourShape)).max(7)

/** The message for a kind that is unknown or not open to submissions yet (hidden, coming soon). */
export const UNAVAILABLE_KIND_MESSAGE = 'this kind of place is not available yet'

export const placeSubmissionSchema = z
  .object({
    name: z.string().trim().min(1, 'required').max(160, 'too long'),
    tagline: optionalText(120),
    description: optionalText(2000),
    // One kind of place. The server derives the category from it (categoryOfKind).
    kind: z.custom<SubmittableKindSlug>(isSubmittableKind, UNAVAILABLE_KIND_MESSAGE),
    governorate: z.enum(LISTING_GOVERNORATES),
    // Required: since 24 November 2026 the cities are the towns readers
    // know (core regions) and every governorate has at least one. Never
    // decides which numbers are offered or valid; display only.
    city: z.string().trim().min(1, 'required').max(64, 'too long'),
    address: z.string().trim().min(1, 'required').max(300, 'too long'),
    // Stored as the listing's payments.whish; the other methods are never asked.
    acceptsWhish: z.boolean().default(false),
    // Public contact: stored in the listing's `contact` group.
    publicPhone: contactValue('phone'),
    instagram: contactValue('instagram'),
    facebook: contactValue('facebook'),
    ownerName: z.string().trim().min(1, 'required').max(120, 'too long'),
    ownerEmail: emailAddress,
    ownerPhone: z.string().trim().min(1, 'required').max(40, 'too long'),
    pageTemplate: z.enum(PAGE_TEMPLATES),
    issue: z.coerce.number().int().positive(),
    listingNumber: z.coerce.number().int().positive(),
    locale: z.enum(LOCALE_CODES),
  })
  .superRefine((value, ctx) => {
    if (value.city) {
      const gov = GOVERNORATES.find((g) => g.slug === value.governorate)
      if (!gov || !gov.cities.some((d) => d.slug === value.city)) {
        ctx.addIssue({
          code: 'custom',
          path: ['city'],
          message: 'is not in the chosen governorate',
        })
      }
    }
  })

export type PlaceSubmission = z.infer<typeof placeSubmissionSchema>
