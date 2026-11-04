import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/listings', () => ({ findAllListingSlugs: async () => ['chez-nouna'] }))
vi.mock('../lib/articles', () => ({ findAllArticleSlugs: async () => [] }))
vi.mock('../lib/issues', () => ({ findAllIssueSlugs: async () => [] }))
vi.mock('../lib/pages', () => ({ CONTENT_PAGE_SLUGS: [] }))

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
