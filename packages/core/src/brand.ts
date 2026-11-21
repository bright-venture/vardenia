import { z } from './zod'
import { GOVERNORATES } from './regions'
import { isValidPoint, mapsUrlProblem } from './maps-link'
import { LOCALE_CODES } from './locales'
import { contactInputSchema, openingHourShape } from './place-submission'

/**
 * Restaurant brands and their branches (Task 9, 21 November 2026).
 *
 * A brand groups the branches of one restaurant. Each branch is an ordinary
 * listing with its own place, hours and reservations; the brand only names
 * them together. A partner adds a branch from a restaurant they already own
 * (apps/web lib/branches); the team reviews, sets tier and contract, and
 * publishes it.
 */

/** Most listings one brand holds, the first (source) listing included. */
export const MAX_BRANCHES_PER_BRAND = 20

/** Most branches one partner may add in any 24 hours. */
export const MAX_NEW_BRANCHES_PER_DAY = 5

/** Only restaurants belong to a brand. */
export function canHaveBrand(subcategories: readonly string[] | null | undefined): boolean {
  return Array.isArray(subcategories) && subcategories.includes('restaurants')
}

const GOVERNORATE_SLUGS = GOVERNORATES.map((g) => g.slug) as [string, ...string[]]

const blankToUndefined = (value: unknown) =>
  value === null || (typeof value === 'string' && value.trim() === '') ? undefined : value

/**
 * What a partner sends to add a branch (`POST /partner-data/branches`).
 *
 * STRICT: an unknown key is refused (400 naming it), at the top level, inside
 * `contact` and inside an opening-hours row. So a body carrying `tier`,
 * `_status`, `slug`, `booking`, `qrCode`, `brand` or anything else fails
 * loudly. The server builds the listing from an explicit allow-list as well,
 * so this is the first of two walls, not the only one.
 *
 * A map link or a point is required (both may be sent; the link wins when it
 * carries coordinates, as on the listing). The district must be one of the
 * governorate's, as in the public submission.
 */
export const branchRequestSchema = z
  .strictObject({
    sourceListingId: z.number().int().positive(),
    /** The branch's full name, e.g. "Cafe Nour Jounieh". */
    name: z.string().trim().min(1, 'required').max(160, 'too long'),
    governorate: z.enum(GOVERNORATE_SLUGS),
    district: z.preprocess(blankToUndefined, z.string().trim().max(64).optional()),
    address: z.string().trim().min(1, 'required').max(300, 'too long'),
    mapUrl: z.preprocess(
      blankToUndefined,
      z
        .string()
        .trim()
        .superRefine((value, ctx) => {
          const problem = mapsUrlProblem(value)
          if (problem) ctx.addIssue({ code: 'custom', message: problem })
        })
        .optional(),
    ),
    location: z
      .tuple([z.number(), z.number()])
      .refine(isValidPoint, 'must be a point in Lebanon: longitude then latitude')
      .optional(),
    openingHours: z.array(z.strictObject(openingHourShape)).max(7).optional(),
    contact: contactInputSchema.optional(),
    /** The language of the confirmation email to the partner. */
    locale: z.enum(LOCALE_CODES).optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.mapUrl && !value.location) {
      ctx.addIssue({
        code: 'custom',
        path: ['mapUrl'],
        message: 'paste a Google Maps link or give the map point',
      })
    }
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

export type BranchRequest = z.infer<typeof branchRequestSchema>
