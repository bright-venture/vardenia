import type { MediaField } from './media'

export const ALL_LEBANON_DESCRIPTION =
  'Explore Lebanon through seven regional journeys in Vardenia’s All Lebanon travel magazine. Preview Beirut on pages 4–5 and continue with the Byblos guide.'

/** The import borrowed the Summer issue artwork. A genuine CMS cover always takes precedence. */
export function issueCover(
  issue: { slug?: string | null; cover?: unknown },
  locale: string,
): MediaField {
  const media = issue.cover as MediaField
  if (
    locale === 'en' &&
    issue.slug === 'all-lebanon' &&
    (!media || (typeof media === 'object' && /\/seed-issue-summer-2026[-.]/.test(media.url ?? '')))
  ) {
    return {
      url: '/journey/magazine-pages/all-lebanon-cover.webp',
      width: 1057,
      height: 1500,
      alt: 'All Lebanon magazine cover, with a woman seated beneath a cedar tree',
    }
  }
  return media
}
