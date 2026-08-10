/**
 * Typed client for the Vardenia public API.
 *
 * Used by the mobile app and by any future partner integration. Responses are
 * parsed through the shared zod schemas, so a breaking API change surfaces as a
 * loud validation error in development rather than a blank screen in the app
 * store build three weeks later.
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
