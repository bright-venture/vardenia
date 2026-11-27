'use client'

import { LISTING_GOVERNORATES } from '@vardenia/core/listing-numbers'
import { useFreshJson, type FreshState } from './use-fresh-json'

/**
 * The first choices of the "add your place" form, which is issue first (27
 * November 2026): the issues open to listings, then the places of the chosen
 * one (`/place-submissions/issues`).
 *
 * An All Lebanon issue offers governorates; an issue that covers one
 * governorate offers that governorate's cities, and its governorate is fixed.
 * A place whose block has no free slot comes back with `free: 0`: the form
 * lists it as full and does not let it be chosen.
 */

export type IssueCoverage = 'all-lebanon' | 'governorate'

export interface OpenIssue {
  issueId: number
  title: string
  coverage: IssueCoverage
  /** The issue's governorate when it covers one; null for All Lebanon. */
  governorate: string | null
}

export interface IssuePlace {
  governorate: string
  /** Null on an All Lebanon issue: its places are governorates. */
  city: string | null
  free: number
}

const isWhole = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value)

const isGovernorate = (value: unknown): value is string =>
  typeof value === 'string' && (LISTING_GOVERNORATES as readonly string[]).includes(value)

export function issuesUrl(locale: string): string {
  return `/place-submissions/issues?locale=${encodeURIComponent(locale)}`
}

export function placesUrl(issueId: number): string {
  return `/place-submissions/issues?issue=${issueId}`
}

/**
 * The route's open issues, or null when the reply is anything else. A one
 * governorate issue without a valid governorate offers nothing and is left out.
 */
export function parseIssuesReply(body: unknown): OpenIssue[] | null {
  if (!body || typeof body !== 'object') return null
  const { ok, issues } = body as { ok?: unknown; issues?: unknown }
  if (ok !== true || !Array.isArray(issues)) return null
  return issues.flatMap((raw): OpenIssue[] => {
    if (!raw || typeof raw !== 'object') return []
    const row = raw as Record<string, unknown>
    if (!isWhole(row.issueId) || row.issueId < 1) return []
    const title = typeof row.title === 'string' ? row.title : ''
    if (row.coverage === 'governorate') {
      if (!isGovernorate(row.governorate)) return []
      return [
        { issueId: row.issueId, title, coverage: 'governorate', governorate: row.governorate },
      ]
    }
    return [{ issueId: row.issueId, title, coverage: 'all-lebanon', governorate: null }]
  })
}

/** The route's places of one issue, or null when the reply is anything else. */
export function parsePlacesReply(body: unknown): IssuePlace[] | null {
  if (!body || typeof body !== 'object') return null
  const { ok, places } = body as { ok?: unknown; places?: unknown }
  if (ok !== true || !Array.isArray(places)) return null
  return places.flatMap((raw): IssuePlace[] => {
    if (!raw || typeof raw !== 'object') return []
    const row = raw as Record<string, unknown>
    if (!isGovernorate(row.governorate)) return []
    const city = typeof row.city === 'string' && row.city !== '' ? row.city : null
    const free = isWhole(row.free) && row.free > 0 ? row.free : 0
    return [{ governorate: row.governorate, city, free }]
  })
}

const NO_ISSUES: OpenIssue[] = []
const NO_PLACES: IssuePlace[] = []

/** The issues open to listings, newest first. */
export function useOpenIssues(locale: string): {
  state: FreshState
  issues: OpenIssue[]
  reload: () => void
} {
  const { state, value, reload } = useFreshJson(issuesUrl(locale), parseIssuesReply)
  return { state, issues: value ?? NO_ISSUES, reload }
}

/**
 * The places of the chosen issue with their free counts; idle while none is
 * chosen. `places` keeps its identity until a new answer arrives.
 */
export function useIssuePlaces(issueId: number | null): {
  state: FreshState
  places: IssuePlace[]
  reload: () => void
} {
  const { state, value, reload } = useFreshJson(
    issueId === null ? null : placesUrl(issueId),
    parsePlacesReply,
  )
  return { state, places: value ?? NO_PLACES, reload }
}
