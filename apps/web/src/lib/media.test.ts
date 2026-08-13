import { describe, expect, it } from 'vitest'
import { can, tierOf } from '@vardenia/core'
import { resolveGallery, type MediaField } from './media'

const image = (n: number): MediaField => ({
  url: `https://cdn.example.com/photo-${n}.webp`,
  alt: `Photo ${n}`,
  width: 800,
  height: 600,
})

const gallery = (count: number): MediaField[] => Array.from({ length: count }, (_, i) => image(i))

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
     * Gallery size is one of the concrete things a listing tier buys. Before
     * this, TIER_CAPABILITIES described the limits and nothing enforced them,
     * so a free listing displayed all 40 images a partner pays for.
     */
    it('caps a free listing to one image', () => {
      expect(resolveGallery(gallery(20), can('free', 'galleryLimit'))).toHaveLength(1)
    })

    it('gives each paid tier progressively more', () => {
      expect(resolveGallery(gallery(50), can('listed', 'galleryLimit'))).toHaveLength(6)
      expect(resolveGallery(gallery(50), can('featured', 'galleryLimit'))).toHaveLength(15)
      expect(resolveGallery(gallery(50), can('partner', 'galleryLimit'))).toHaveLength(40)
    })

    it('does not pad when a listing has fewer images than its allowance', () => {
      expect(resolveGallery(gallery(3), can('partner', 'galleryLimit'))).toHaveLength(3)
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
    for (const t of ['free', 'listed', 'featured', 'partner'] as const) {
      expect(tierOf(t)).toBe(t)
    }
  })

  /** Fails closed: a corrupt tier must not hand out partner privileges. */
  it('falls back to free for anything unrecognised', () => {
    for (const v of [null, undefined, '', 'gold', 42, {}]) {
      expect(tierOf(v)).toBe('free')
    }
  })
})
