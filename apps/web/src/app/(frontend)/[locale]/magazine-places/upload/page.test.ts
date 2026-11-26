import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
  setRequestLocale: vi.fn(),
}))
// i18n/routing (next-intl navigation) also reads redirect and permanentRedirect.
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('not found')
  },
  redirect: vi.fn(),
  permanentRedirect: vi.fn(),
}))
vi.mock('../../../../../components/places/PlacePhotoUpload', () => ({
  PlacePhotoUpload: () => null,
}))

const { generateMetadata } = await import('./page')

describe('the phone upload page', () => {
  it('is not indexed, sends no referrer, and has a title', async () => {
    const meta = await generateMetadata({ params: Promise.resolve({ locale: 'en' }) })
    expect(meta.robots).toEqual({ index: false, follow: false })
    expect(meta.referrer).toBe('no-referrer')
    expect(meta.title).toBe('title')
  })

  it('has no metadata for an unknown locale', async () => {
    expect(await generateMetadata({ params: Promise.resolve({ locale: 'xx' }) })).toEqual({})
  })

  it('is not in the sitemap', () => {
    const sitemap = readFileSync(path.resolve(__dirname, '../../../../sitemap.ts'), 'utf8')
    expect(sitemap).not.toContain('magazine-places')
  })
})
