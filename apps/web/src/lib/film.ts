import { mediaPublicBase } from './storage-base'

/**
 * Where the home page film is read from.
 *
 * The film is 8.7 MB (1.6 MB on phones), and served from the site itself it
 * was the largest share of the host's bandwidth bill: every new visitor on a
 * computer downloads all of it. The same files sit in the media bucket under
 * `site/`, versioned and kept by browsers for a year, where the storage plan's
 * own transfer allowance pays for them instead.
 *
 * Empty when storage is not configured (local disk): the page then plays the
 * copies in `public/`, which stay as they are.
 *
 * Replacing the film means uploading the new files under a new version name
 * (`hero-film-v2.mp4`) and changing FILM_FILES: the old name is cached for a
 * year by every browser that has seen it.
 */

export const FILM_FILES = {
  desktop: 'hero-film-v1.mp4',
  mobile: 'hero-film-mobile-v1.mp4',
} as const

type Env = Record<string, string | undefined>

export function filmBase(env: Env = process.env): string {
  if (env.MEDIA_STORAGE_ADAPTER !== 's3') return ''
  const base = mediaPublicBase(env)
  return base ? `${base}/site` : ''
}

/** The film's origin, for the media-src of the public security policy. */
export function filmOrigin(env: Env = process.env): string[] {
  try {
    const url = new URL(filmBase(env))
    return url.protocol === 'https:' ? [url.origin] : []
  } catch {
    return []
  }
}

/** The two sources for the hero, from storage or from the site's own files. */
export function filmSources(base: string | undefined) {
  return base
    ? { desktop: `${base}/${FILM_FILES.desktop}`, mobile: `${base}/${FILM_FILES.mobile}` }
    : { desktop: '/hero/hero-film.mp4', mobile: '/journey/hero-film-mobile.mp4' }
}
