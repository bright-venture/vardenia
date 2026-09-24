import { describe, expect, it } from 'vitest'
import {
  goesToPrint,
  isPubliclyVisible,
  populated,
  relatedId,
  type QrDoc,
  type RelatedDoc,
} from './qr-doc'

/**
 * The draft check exists because of a bug that only shows up on paper.
 *
 * The QR redirect reads its target with access control bypassed, so it sees
 * draft documents. The page it redirects to reads with access control on, so it
 * refuses them. Unpublish a listing after the magazine ships and every scan of
 * a printed code landed on a 404 instead of the "this listing has moved" page
 * that exists for exactly this situation.
 */

describe('isPubliclyVisible', () => {
  it('accepts a published document', () => {
    expect(isPubliclyVisible({ slug: 'x', _status: 'published' })).toBe(true)
  })

  it('rejects a draft', () => {
    expect(isPubliclyVisible({ slug: 'x', _status: 'draft' })).toBe(false)
  })

  /**
   * Issues have no draft state, so `_status` is simply absent. Treating a
   * missing status as hidden would break every printed issue code.
   */
  it('accepts a document with no status at all', () => {
    expect(isPubliclyVisible({ slug: 'summer-2026' })).toBe(true)
    expect(isPubliclyVisible({ slug: 'summer-2026', _status: null })).toBe(true)
  })

  it('rejects nothing at all', () => {
    expect(isPubliclyVisible(null)).toBe(false)
  })

  it('does not treat an unexpected status as hidden', () => {
    // Only the literal 'draft' hides a document. A future status we do not know
    // about should not silently take printed codes offline.
    const odd = { slug: 'x', _status: 'archived' } as unknown as RelatedDoc
    expect(isPubliclyVisible(odd)).toBe(true)
  })
})

describe('populated', () => {
  it('returns the document when the relationship is expanded', () => {
    expect(populated({ id: 1, slug: 'a' })).toEqual({ id: 1, slug: 'a' })
  })

  it('returns null for a bare id, which is what depth 0 gives', () => {
    expect(populated(7)).toBeNull()
  })

  it('returns null for nothing', () => {
    expect(populated(null)).toBeNull()
    expect(populated(undefined)).toBeNull()
  })
})

describe('relatedId', () => {
  it('reads the id in either form', () => {
    expect(relatedId(7)).toBe(7)
    expect(relatedId({ id: 7, slug: 'a' })).toBe(7)
  })

  it('returns null rather than undefined, so it can be written to a column', () => {
    expect(relatedId(null)).toBeNull()
    expect(relatedId(undefined)).toBeNull()
    expect(relatedId({ slug: 'no-id' })).toBeNull()
  })
})

/**
 * Basic is the website-only tier and gets no QR code. A code it already has -
 * from before it moved down - stays active, but is not printed again.
 */
describe('goesToPrint', () => {
  const code = (business: unknown) => ({ id: 1, code: 'AASBVQR', business }) as QrDoc

  it('prints the code of a listing on a tier that gets one', () => {
    expect(goesToPrint(code({ id: 2, tier: 'silver' }))).toBe(true)
  })

  it('leaves out the code of a basic listing', () => {
    expect(goesToPrint(code({ id: 2, tier: 'basic' }))).toBe(false)
  })

  it('keeps what it cannot judge rather than dropping a card from the proof', () => {
    expect(goesToPrint(code(2))).toBe(true)
    expect(goesToPrint(code({ id: 2 }))).toBe(true)
    expect(goesToPrint(code(null))).toBe(true)
  })
})
