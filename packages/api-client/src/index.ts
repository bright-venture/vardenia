/**
 * THIS DESCRIBES AN API THAT DOES NOT EXIST YET. NOTHING CALLS IT.
 *
 * Read this before building on any of it. Every method below would fail today,
 * because it was written against an intended public API that was never built.
 * The site talks to Payload's own REST API instead, which has different paths
 * and a different response shape:
 *
 *   this client asks for            Payload actually serves
 *   ----------------------------    ------------------------------------------
 *   GET /businesses/:slug           /api/businesses/:id   (numeric id, not slug)
 *   GET /qr/:code                   nothing - that route serves images, not JSON
 *   { items, total, hasMore }       { docs, totalDocs, hasNextPage }
 *   id: string                      number (Postgres serial)
 *   heroImage: url string           an object with url, sizes, width, height
 *   coordinates: { lat, lng }       location: [lng, lat]
 *
 * The zod schemas it parses through (packages/core/src/schemas.ts) describe the
 * same imaginary shapes and are used by nothing except this file.
 *
 * It is kept because the design is sound and worth reusing - the QR resolution
 * idea in particular, which would let the app open a scanned listing natively
 * instead of bouncing the reader out to a browser. It is left unbuilt because
 * nobody yet knows what a real mobile screen needs, and guessing twice is worse
 * than guessing once.
 *
 * Before using any of this, pick one:
 *   1. Build the routes it expects, mapping Payload's shape onto these contracts.
 *   2. Rewrite it against Payload's actual REST shape and delete the schemas.
 *
 * Do not assume it works because it type-checks. It type-checks against itself.
 */

import {
  businessDetailSchema,
  businessSummarySchema,
  paginatedSchema,
  qrResolutionSchema,
  type BusinessDetail,
  type BusinessQuery,
  type QrResolution,
} from '@vardenia/core'
import { z } from 'zod'

export interface ClientOptions {
  baseUrl: string
  /** Injected so React Native, Next server components, and tests can differ. */
  fetch?: typeof globalThis.fetch
  /** Applied to every request. Mobile passes the user's chosen locale. */
  locale?: 'en' | 'ar'
  timeoutMs?: number
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly path: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

const businessPageSchema = paginatedSchema(businessSummarySchema)

export function createClient(options: ClientOptions) {
  const doFetch = options.fetch ?? globalThis.fetch
  const timeoutMs = options.timeoutMs ?? 10_000
  const baseUrl = options.baseUrl.replace(/\/$/, '')

  async function request<T extends z.ZodTypeAny>(
    path: string,
    schema: T,
    init?: RequestInit,
  ): Promise<z.infer<T>> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await doFetch(`${baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          accept: 'application/json',
          'accept-language': options.locale ?? 'en',
          ...init?.headers,
        },
      })
      if (!response.ok) {
        throw new ApiError(`Request failed: ${response.statusText}`, response.status, path)
      }
      return schema.parse(await response.json())
    } finally {
      clearTimeout(timer)
    }
  }

  return {
    /** Directory search. Omit `near` to get tier-ranked results instead of distance-ranked. */
    searchBusinesses(query: Partial<BusinessQuery> = {}) {
      const params = new URLSearchParams()
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null) continue
        if (key === 'near' && typeof value === 'object') {
          const near = value as { lat: number; lng: number }
          params.set('lat', String(near.lat))
          params.set('lng', String(near.lng))
          continue
        }
        params.set(key, String(value))
      }
      return request(`/businesses?${params.toString()}`, businessPageSchema)
    },

    getBusiness(slug: string): Promise<BusinessDetail> {
      return request(`/businesses/${encodeURIComponent(slug)}`, businessDetailSchema)
    },

    /**
     * Resolve a scanned code without following the redirect. The app uses this
     * so it can deep-link natively instead of bouncing the user out to Safari.
     */
    resolveQr(code: string): Promise<QrResolution> {
      return request(`/qr/${encodeURIComponent(code)}`, qrResolutionSchema)
    },
  }
}

export type VardeniaClient = ReturnType<typeof createClient>
