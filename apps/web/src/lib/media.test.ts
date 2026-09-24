import { describe, expect, it } from 'vitest'
import { can, tierOf } from '@vardenia/core'
import {
  PLACEHOLDER_STEM,
  isPlaceholder,
  resolveGallery,
  resolvePhotograph,
  type MediaField,
} from './media'

const image = (n: number): MediaField => ({
  url: `https://cdn.example.com/photo-${n}.webp`,
  alt: `Photo ${n}`,
  width: 800,
  height: 600,
})

const gallery = (count: number): MediaField[] => Array.from({ length: count }, (_, i) => image(i))

/**
 * The listing page draws a full-height photograph when there is one and a flat
 * masthead when there is not, so "is this a photograph" decides the shape of the
 * most important page in the product. Both directions are tested: a stand-in
 * treated as real puts one identical picture on 308 listings, and a real
 * photograph treated as a stand-in throws away the only one a place has.
 */
describe('telling a photograph from the shared stand-in', () => {
  const placeholder = (): MediaField => ({
    url: `https://cdn.example.com/${PLACEHOLDER_STEM}-6df1a4d129b4e37e9e5214c4-1200x630.webp`,
    alt: '',
    width: 1200,
    height: 630,
  })

  it('recognises the stand-in by its filename', () => {
    expect(isPlaceholder(`${PLACEHOLDER_STEM}-a3f19c4e2b7d5081cf20b114.webp`)).toBe(true)
  })

  it('does not mistake a real photograph for it', () => {
    expect(isPlaceholder('hotel-albergo-terrace.webp')).toBe(false)
  })

  it('tolerates a missing filename rather than throwing', () => {
    expect(isPlaceholder(null)).toBe(false)
    expect(isPlaceholder(undefined)).toBe(false)
    expect(isPlaceholder(42)).toBe(false)
  })

  it('resolves a real photograph', () => {
    expect(resolvePhotograph(image(1))?.src).toContain('photo-1')
  })

  it('resolves the stand-in to nothing, so a page can choose another shape', () => {
    expect(resolvePhotograph(placeholder())).toBeNull()
  })

  it('resolves a listing with no image at all to nothing', () => {
    expect(resolvePhotograph(null)).toBeNull()
  })
})

describe('resolveGallery', () => {
  it('returns every image when no limit is given', () => {
    expect(resolveGallery(gallery(12))).toHaveLength(12)
  })

  it('skips entries that are ids rather than populated documents', () => {
    expect(resolveGallery([image(0), 42, null, image(1)])).toHaveLength(2)
  })

  it('tolerates a missing gallery', () => {
    expect(resolveGallery(undefined)).toEqual([])
    expect(resolveGallery(null)).toEqual([])
  })

  describe('tier limits', () => {
    /**
     * Gallery size comes from TIER_CAPABILITIES. Before that was enforced, a
     * listing displayed every image uploaded to it, 40 in one case.
     */
    it('caps every tier at its allowance', () => {
      for (const t of ['online', 'free'] as const) {
        expect(resolveGallery(gallery(50), can(t, 'galleryLimit')), t).toHaveLength(15)
      }
    })

    it('does not pad when a listing has fewer images than its allowance', () => {
      expect(resolveGallery(gallery(3), can('free', 'galleryLimit'))).toHaveLength(3)
    })

    it('keeps the first images, so ordering in the admin decides what shows', () => {
      const shown = resolveGallery(gallery(10), 2)
      expect(shown.map((i) => i.alt)).toEqual(['Photo 0', 'Photo 1'])
    })

    it('handles a zero limit without returning everything', () => {
      expect(resolveGallery(gallery(5), 0)).toHaveLength(0)
    })
  })
})

describe('tierOf', () => {
  it('passes through the real tiers', () => {
    for (const t of ['online', 'free'] as const) {
      expect(tierOf(t)).toBe(t)
    }
  })

  /** Retired when four tiers became two, and no longer a tier. */
  it('does not pass through a retired tier', () => {
    for (const t of ['listed', 'partner']) expect(tierOf(t)).toBe('online')
  })

  /** Fails closed: a corrupt tier must not hand out partner privileges. */
  it('falls back to the lowest tier for anything unrecognised', () => {
    for (const v of [null, undefined, '', 'gold', 42, {}]) {
      expect(tierOf(v)).toBe('online')
    }
  })
})
