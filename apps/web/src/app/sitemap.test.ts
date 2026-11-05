import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/listings', () => ({ findAllListingSlugs: vi.fn(async () => ['chez-nouna']) }))
vi.mock('../lib/articles', () => ({ findAllArticleSlugs: vi.fn(async () => []) }))
vi.mock('../lib/issues', () => ({ findAllIssueSlugs: async () => [] }))
vi.mock('../lib/pages', () => ({ CONTENT_PAGE_SLUGS: [] }))

const { findAllListingSlugs } = await import('../lib/listings')
const { findAllArticleSlugs } = await import('../lib/articles')
const { default: sitemap } = await import('./sitemap')

/** The sitemap lists the site only once the site asks to be indexed. */
describe('sitemap', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('is empty while indexing is off, so no address leaks before launch', async () => {
    vi.stubEnv('NEXT_PUBLIC_ALLOW_INDEX', '')
    expect(await sitemap()).toEqual([])
  })

  it('lists the listings once indexing is on', async () => {
    vi.stubEnv('NEXT_PUBLIC_ALLOW_INDEX', 'true')
    const urls = (await sitemap()).map((entry) => entry.url)
    expect(urls.some((url) => url.endsWith('/directory/chez-nouna'))).toBe(true)
  })
})

describe('sitemap SEO signals', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('requests only indexable documents without changing static generation defaults', async () => {
    vi.stubEnv('NEXT_PUBLIC_ALLOW_INDEX', 'true')
    await sitemap()
    expect(findAllListingSlugs).toHaveBeenLastCalledWith({ indexableOnly: true })
    expect(findAllArticleSlugs).toHaveBeenLastCalledWith({ indexableOnly: true })
  })

  it('uses absolute alternates and the same default URL as page metadata', async () => {
    vi.stubEnv('NEXT_PUBLIC_ALLOW_INDEX', 'true')
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://example.com/')
    const entries = await sitemap()
    const home = entries.find((entry) => entry.url === 'https://example.com/')!
    expect(home.alternates?.languages?.['x-default']).toBe(home.url)
    expect(home.alternates?.languages?.ar).toBe('https://example.com/ar')
    expect(entries.every((entry) => entry.lastModified === undefined)).toBe(true)
  })
})
