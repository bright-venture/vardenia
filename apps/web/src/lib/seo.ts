import type { Metadata } from 'next'
import { DEFAULT_LOCALE, type Locale } from '@vardenia/i18n'
import { isIndexingAllowed } from './indexing'
import { resolveImage, type MediaField } from './media'

/**
 * One place that turns the SEO group into page metadata.
 *
 * It exists because the four page types had each grown their own version, and
 * they had drifted: listings and articles read the title and description but
 * ignored "hide from search engines", issues ignored all three, and site pages
 * had no social image. A staff member could tick a box that saved, looked like
 * it worked, and did nothing - which is worst at the exact moment it matters,
 * when a listing has to come down at an advertiser's request.
 *
 * Every public page builds metadata through this. Adding a page type means
 * calling it, not reimplementing it.
 */

export interface SeoGroup {
  title?: string | null
  description?: string | null
  image?: MediaField
  noIndex?: boolean | null
}

/** The group as Payload returns it, which is `undefined` when never filled in. */
export function seoOf(value: unknown): SeoGroup {
  return (value ?? {}) as SeoGroup
}

interface BuildArgs {
  /** The raw `seo` group off the document. */
  seo: unknown
  /** Used when `seo.title` is empty - normally the document's own title. */
  title?: string | null
  /** Used when `seo.description` is empty - an excerpt, a tagline. */
  description?: string | null
  /** Used when `seo.image` is empty - normally the hero image. */
  fallbackImage?: MediaField
  /**
   * Path without a locale prefix, e.g. `/directory/le-royal-hotel`.
   *
   * Canonical and hreflang are built from it. Both matter for a bilingual site:
   * without them Google reads the English and Arabic versions as two pages
   * competing for the same terms rather than as translations of one.
   */
  path: string
  /**
   * The locale being rendered.
   *
   * Required because the canonical must point at the page you are actually on.
   * Every page previously hardcoded the unprefixed path, so the Arabic version
   * declared the English URL as its canonical - which tells Google the Arabic
   * page is a duplicate and it should be dropped from the index. On a product
   * selling to a bilingual market that quietly deletes half the reach.
   */
  locale: Locale
  type?: 'website' | 'article'
  publishedTime?: string | null
}

export function buildMetadata({
  seo: rawSeo,
  title,
  description,
  fallbackImage,
  path,
  locale,
  type = 'website',
  publishedTime,
}: BuildArgs): Metadata {
  const seo = seoOf(rawSeo)

  const resolvedTitle = seo.title || title || undefined
  const resolvedDescription = seo.description || description || undefined
  const image = resolveImage(seo.image, 'og') ?? resolveImage(fallbackImage, 'og')

  return {
    title: resolvedTitle,
    description: resolvedDescription,

    /**
     * The whole point of the checkbox. `follow: false` as well as `index: false`
     * so links out of a hidden page do not drag it back into the index.
     *
     * The site-wide switch is applied here as well as in the layout, rather than
     * relying on the layout alone. Next merges metadata by field, and a child
     * that sets `robots` replaces the parent's - so a page whose editor ticked
     * nothing would emit `robots: undefined` and quietly discard the site-wide
     * noindex it was supposed to inherit. Deciding it in one place removes the
     * question.
     */
    robots: seo.noIndex || !isIndexingAllowed() ? { index: false, follow: false } : undefined,

    openGraph: {
      title: resolvedTitle,
      description: resolvedDescription,
      images: image ? [{ url: image.src, width: image.width, height: image.height }] : undefined,
      type,
      ...(publishedTime ? { publishedTime } : {}),
    },

    alternates: alternatesFor(path, locale),
  }
}

/**
 * Canonical and hreflang for one path, in the locale being rendered.
 *
 * # Why this is exported rather than living inside buildMetadata
 *
 * Only four page types call `buildMetadata`: listings, articles, issues and the
 * pages built from a `seo` group. Everything else on the public site writes its
 * own metadata, because there is no document behind it to read a `seo` group
 * from - the homepage, the directory index, the seven section pages, the three
 * magazine indexes, the six standing pages and both legal documents.
 *
 * Measured against production, every one of those emitted no hreflang at all,
 * and all but the standing pages emitted no canonical either. So `/directory`
 * and `/ar/directory` were two URLs with nothing tying them together, which
 * Google reads as duplicates competing for the same terms rather than as one
 * page in two languages. On a bilingual product that is half the reach, lost
 * quietly.
 *
 * Taking the alternates out of `buildMetadata` lets a page that has no `seo`
 * group still get this right, without reimplementing it and drifting.
 *
 * # Why the languages are built by the same helper as the canonical
 *
 * Written by hand these disagreed at the root: `localizedPath('/', 'ar')` gives
 * `/ar`, while `/ar${path}` gives `/ar/`. A page declaring one URL as canonical
 * and a different one as its own Arabic version is exactly the confusion
 * hreflang exists to prevent. The homepage passes '/' now, so this is no longer
 * latent.
 */
export function alternatesFor(path: string, locale: Locale): NonNullable<Metadata['alternates']> {
  return {
    canonical: localizedPath(path, locale),
    languages: {
      en: localizedPath(path, DEFAULT_LOCALE),
      ar: localizedPath(path, 'ar'),
      /**
       * Where to send a reader whose language we do not publish. Google treats
       * a set without it as having no default, and picks one itself; English is
       * the site's default locale and the unprefixed URL, so it says so.
       */
      'x-default': localizedPath(path, DEFAULT_LOCALE),
    },
  }
}

/** English is unprefixed; everything else carries its locale. */
function localizedPath(path: string, locale: Locale): string {
  if (locale === DEFAULT_LOCALE) return path
  return path === '/' ? `/${locale}` : `/${locale}${path}`
}
