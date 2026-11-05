import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildMetadata } from './seo'

const args = {
  seo: undefined,
  title: 'A place in Lebanon',
  description: 'The published description',
  path: '/directory/example',
  locale: 'ar' as const,
}

afterEach(() => vi.unstubAllEnvs())

describe('page social metadata', () => {
  it('keeps the page title and description on both social platforms', () => {
    const metadata = buildMetadata(args)
    for (const social of [metadata.openGraph, metadata.twitter]) {
      expect(social?.title).toBe(args.title)
      expect(social?.description).toBe(args.description)
    }
    expect(metadata.openGraph?.url).toBe('/ar/directory/example')
    expect(metadata.openGraph?.siteName).toBe('Vardenia')
  })

  it('keeps the branded fallback when the page has no photograph', () => {
    const metadata = buildMetadata(args)
    expect(metadata.openGraph?.images).toEqual([
      { url: '/og-default.png', width: 1200, height: 630, alt: 'Vardenia' },
    ])
    expect(metadata.twitter?.images).toEqual(metadata.openGraph?.images)
  })

  it('uses editorial overrides and the chosen SEO photograph on both cards', () => {
    const metadata = buildMetadata({
      ...args,
      seo: {
        title: 'Custom title',
        description: 'Custom description',
        image: { url: '/custom.jpg', alt: 'Custom photo', width: 1200, height: 630 },
      },
      fallbackImage: { url: '/hero.jpg' },
    })
    expect(metadata.twitter?.title).toBe('Custom title')
    expect(metadata.twitter?.description).toBe('Custom description')
    expect(metadata.twitter?.images).toEqual(metadata.openGraph?.images)
    expect(metadata.openGraph?.images).toEqual([
      { url: '/custom.jpg', alt: 'Custom photo', width: 1200, height: 630 },
    ])
  })

  it('preserves both the launch and individual noindex protections', () => {
    vi.stubEnv('NEXT_PUBLIC_ALLOW_INDEX', '')
    expect(buildMetadata(args).robots).toEqual({ index: false, follow: false })
    vi.stubEnv('NEXT_PUBLIC_ALLOW_INDEX', 'true')
    expect(buildMetadata(args).robots).toBeUndefined()
    expect(buildMetadata({ ...args, seo: { noIndex: true } }).robots).toEqual({
      index: false,
      follow: false,
    })
  })
})
