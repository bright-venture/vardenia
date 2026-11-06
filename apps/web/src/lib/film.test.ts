import { describe, expect, it } from 'vitest'
import { filmBase, filmOrigin, filmSources } from './film'

/** The home page film is read from the media bucket, not the host, when it can be. */
const storage = {
  MEDIA_STORAGE_ADAPTER: 's3',
  S3_ENDPOINT: 'https://abc.storage.supabase.co/storage/v1/s3',
  S3_BUCKET: 'media',
}

describe('the home page film', () => {
  it('comes from the media bucket when storage is configured', () => {
    expect(filmBase(storage)).toBe(
      'https://abc.storage.supabase.co/storage/v1/object/public/media/site',
    )
    expect(filmSources(filmBase(storage)).desktop).toMatch(/\/site\/hero-film-v1\.mp4$/)
    expect(filmOrigin(storage)).toEqual(['https://abc.storage.supabase.co'])
  })

  it("falls back to the site's own files without storage", () => {
    expect(filmBase({ ...storage, MEDIA_STORAGE_ADAPTER: 'local' })).toBe('')
    expect(filmSources('')).toEqual({
      desktop: '/hero/hero-film.mp4',
      mobile: '/journey/hero-film-mobile.mp4',
    })
    expect(filmOrigin({})).toEqual([])
  })
})
