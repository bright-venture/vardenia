/**
 * Wire contracts shared by the web app, the mobile app, and the public API.
 *
 * These are the *public* shapes, deliberately narrower than the CMS documents -
 * a listing's internal notes, contract value, and sales owner must never leak
 * into an API response. Payload's generated types describe the database; these
 * describe what leaves the building.
 */

import { z } from 'zod'
import { LISTING_TIERS } from './tiers'
import { QR_PLACEMENTS, QR_TARGET_TYPES } from './qr'

export const localeSchema = z.enum(['en', 'ar'])
export type Locale = z.infer<typeof localeSchema>

export const coordinatesSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
})

export const openingHoursSchema = z.object({
  day: z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']),
  /** 24h "HH:MM". Null/null means closed that day. */
  opens: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable(),
  closes: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable(),
})

export const businessSummarySchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  tagline: z.string().nullable(),
  category: z.string(),
  subcategories: z.array(z.string()),
  governorate: z.string(),
  district: z.string().nullable(),
  coordinates: coordinatesSchema.nullable(),
  heroImage: z.string().url().nullable(),
  tier: z.enum(LISTING_TIERS),
  verified: z.boolean(),
  priceRange: z.number().int().min(1).max(4).nullable(),
  qrCode: z.string().nullable(),
})
export type BusinessSummary = z.infer<typeof businessSummarySchema>

export const businessDetailSchema = businessSummarySchema.extend({
  description: z.string().nullable(),
  address: z.string().nullable(),
  gallery: z.array(z.string().url()),
  phone: z.string().nullable(),
  whatsapp: z.string().nullable(),
  email: z.string().email().nullable(),
  website: z.string().url().nullable(),
  reservationUrl: z.string().url().nullable(),
  menuUrl: z.string().url().nullable(),
  socials: z.object({
    instagram: z.string().url().nullable(),
    facebook: z.string().url().nullable(),
    tiktok: z.string().url().nullable(),
    linkedin: z.string().url().nullable(),
    youtube: z.string().url().nullable(),
  }),
  openingHours: z.array(openingHoursSchema),
  amenities: z.array(z.string()),
})
export type BusinessDetail = z.infer<typeof businessDetailSchema>

/**
 * Directory search. `near` + `radiusKm` drive the PostGIS query behind
 * "attractions near me"; without `near`, results fall back to tier rank.
 */
export const businessQuerySchema = z.object({
  q: z.string().trim().min(1).max(120).optional(),
  category: z.string().optional(),
  subcategory: z.string().optional(),
  governorate: z.string().optional(),
  district: z.string().optional(),
  near: coordinatesSchema.optional(),
  radiusKm: z.number().positive().max(100).default(25),
  tier: z.enum(LISTING_TIERS).optional(),
  openNow: z.boolean().optional(),
  hasOffers: z.boolean().optional(),
  locale: localeSchema.default('en'),
  page: z.number().int().positive().default(1),
  perPage: z.number().int().positive().max(50).default(20),
})
export type BusinessQuery = z.infer<typeof businessQuerySchema>

export const paginatedSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    items: z.array(item),
    page: z.number().int(),
    perPage: z.number().int(),
    total: z.number().int(),
    hasMore: z.boolean(),
  })

export const qrResolutionSchema = z.object({
  code: z.string(),
  targetType: z.enum(QR_TARGET_TYPES),
  /** Canonical destination the client should land on. */
  url: z.string(),
  placement: z.enum(QR_PLACEMENTS),
})
export type QrResolution = z.infer<typeof qrResolutionSchema>
