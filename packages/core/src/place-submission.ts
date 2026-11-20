import { z } from './zod'
import { LOCALE_CODES } from './locales'
import { LISTING_GOVERNORATES } from './listing-numbers'
import { AMENITY_SLUGS, PRICE_SLUGS } from './attributes'
import { GOVERNORATES } from './regions'
import { CATEGORY_SLUGS, SUBCATEGORY_PARENT } from './taxonomy'

/**
 * What a business owner submits on the public "add your place" form.
 *
 * Shared by the server route and the client form. Unknown keys are stripped
 * (zod's default), and the server relies on that: a smuggled `tier` or
 * `_status` never reaches the record.
 */

export const PAGE_TEMPLATES = ['a', 'b', 'c'] as const

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

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
  z.string().trim().regex(TIME_RE, 'use 24-hour time like 09:00').optional(),
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
  }, 'must be an email address')

/** Optional text: an empty string counts as absent. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, 'too long')
    .optional()
    .transform((v) => (v ? v : undefined))

const httpUrl = z
  .string()
  .trim()
  .max(300, 'too long')
  .refine((value) => {
    try {
      const url = new URL(value)
      return url.protocol === 'http:' || url.protocol === 'https:'
    } catch {
      return false
    }
  }, 'must start with http:// or https://')

const oneOf = (values: readonly string[], message: string) =>
  z.string().refine((v) => values.includes(v), message)

export const placeSubmissionSchema = z
  .object({
    name: z.string().trim().min(1, 'required').max(160, 'too long'),
    tagline: optionalText(120),
    description: optionalText(2000),
    category: oneOf(CATEGORY_SLUGS, 'unknown category'),
    subcategories: z.array(oneOf(Object.keys(SUBCATEGORY_PARENT), 'unknown subcategory')).max(20),
    governorate: z.enum(LISTING_GOVERNORATES),
    district: optionalText(64),
    area: z.preprocess(blankToUndefined, z.coerce.number().int().positive().optional()),
    address: z.string().trim().min(1, 'required').max(300, 'too long'),
    openingHours: z
      .array(
        z.object({
          day: z.enum(DAYS),
          opens: hhmm,
          closes: hhmm,
          closed: z.boolean(),
        }),
      )
      .max(7)
      .optional(),
    priceRange: z.preprocess(
      blankToUndefined,
      oneOf(PRICE_SLUGS, 'unknown price range').optional(),
    ),
    amenities: z.array(oneOf(AMENITY_SLUGS, 'unknown amenity')).max(50),
    payments: z.object({
      cash: z.boolean(),
      card: z.boolean(),
      whish: z.boolean(),
      omt: z.boolean(),
    }),
    publicPhone: optionalText(40),
    website: z.preprocess(blankToUndefined, httpUrl.optional()),
    ownerName: z.string().trim().min(1, 'required').max(120, 'too long'),
    ownerEmail: emailAddress,
    ownerPhone: z.string().trim().min(1, 'required').max(40, 'too long'),
    pageTemplate: z.enum(PAGE_TEMPLATES),
    issue: z.coerce.number().int().positive(),
    listingNumber: z.coerce.number().int().positive(),
    locale: z.enum(LOCALE_CODES),
  })
  .superRefine((value, ctx) => {
    value.subcategories.forEach((sub, index) => {
      if (SUBCATEGORY_PARENT[sub] !== value.category) {
        ctx.addIssue({
          code: 'custom',
          path: ['subcategories', index],
          message: 'does not belong to the chosen category',
        })
      }
    })
    if (value.district) {
      const gov = GOVERNORATES.find((g) => g.slug === value.governorate)
      if (!gov || !gov.districts.some((d) => d.slug === value.district)) {
        ctx.addIssue({
          code: 'custom',
          path: ['district'],
          message: 'is not in the chosen governorate',
        })
      }
    }
  })

export type PlaceSubmission = z.infer<typeof placeSubmissionSchema>
