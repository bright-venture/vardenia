/**
 * The shape of a QR code document as the runtime actually hands it to us.
 *
 * Payload generates precise types into payload-types.ts, but that file is
 * gitignored and regenerated from the schema, so the handful of places that read
 * a QR document defensively were each typing it as `Record<string, any>`
 * instead. That silences the compiler on genuine mistakes: `qr.buisness` would
 * have type-checked happily and returned undefined at runtime, sending every
 * scan of that code to the not-found page.
 *
 * These declarations are narrow on purpose. They describe only the fields the
 * redirect, the print sheet, and the delete guards actually read.
 */

import type { QrPlacement } from '@vardenia/core'

/**
 * A relationship as Payload serialises it: the id alone at depth 0, the whole
 * document once populated. Every read has to handle both, which is why the call
 * sites all branch on `typeof x === 'object'`.
 */
export type Related<T> = number | T | null | undefined

/** The parts of a related document we use to build a link or a label. */
export interface RelatedDoc {
  id?: number
  slug?: string | null
  title?: string | null
  name?: string | null
  /**
   * Draft or published, on the collections that have drafts turned on
   * (businesses, articles). Absent on issues, which have no draft state and are
   * therefore always public.
   */
  _status?: 'draft' | 'published' | null
}

export interface QrDoc {
  id: number
  code: string
  targetType?: string | null
  business?: Related<RelatedDoc>
  article?: Related<RelatedDoc>
  issue?: Related<RelatedDoc>
  category?: string | null
  externalUrl?: string | null
  placement?: QrPlacement | null
  active?: boolean | null
  scanCount?: number | null
}

/** Narrows a relationship to the populated document, or null when it is just an id. */
export function populated(value: Related<RelatedDoc>): RelatedDoc | null {
  return typeof value === 'object' && value !== null ? value : null
}

/**
 * Whether a related document is visible to the public.
 *
 * Only meaningful for collections with drafts. `_status` is absent on issues,
 * and absent on anything fetched at depth 0, so the default is "yes" - the
 * caller is expected to have populated the document before asking.
 *
 * This exists because the QR redirect reads documents with access control
 * bypassed (it must: qr-codes is staff-only, and the reader is anonymous),
 * which means it sees drafts that the destination page will refuse to render.
 */
export function isPubliclyVisible(doc: RelatedDoc | null): boolean {
  if (!doc) return false
  return doc._status !== 'draft'
}

/**
 * The id of a relationship, whichever form it arrived in.
 *
 * Returns null rather than undefined so it can be written straight into a
 * nullable column without another fallback at the call site.
 */
export function relatedId(value: Related<RelatedDoc>): number | null {
  if (typeof value === 'number') return value
  return populated(value)?.id ?? null
}
