import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'
import { DEFAULT_LOCALE, isLocale } from '@vardenia/i18n'
import { contentPage, type ContentPageSlug } from '../lib/pages'
import { alternatesFor } from '../lib/seo'
import { ContentPageView } from './ContentPage'

/**
 * The six standing pages, from one place.
 *
 * # Why they are static routes and not one dynamic segment
 *
 * `/about` is a single-segment path, and so is `/stay`. There is already a
 * top-level `[section]` route serving the seven directory sections, and two
 * dynamic segments cannot share a level - so a second one would collide.
 *
 * Static route folders win over a dynamic sibling in Next, which makes six small
 * files the arrangement that works. Each is three lines and names its own slug;
 * everything else lives here, so adding a page is a folder and a line rather
 * than a copied template.
 *
 * The alternative was folding these into `[section]` and branching on what the
 * slug turned out to be. One route rendering two unrelated templates is harder
 * to follow than six files that each say what they are.
 */

/** Exported because the six route files re-export functions typed with it. */
export interface ContentRouteProps {
  params: Promise<{ locale: string }>
}

export function contentRoute(slug: ContentPageSlug) {
  async function generateMetadata({ params }: ContentRouteProps): Promise<Metadata> {
    const { locale } = await params
    const page = contentPage(slug, isLocale(locale) ? locale : DEFAULT_LOCALE)
    if (!page) return {}

    // Title and description now come from the page in the reader's own language,
    // which matters here more than on most pages: these are what a search engine
    // shows in its results, so an English description under an Arabic URL was
    // competing for Arabic searches with English text.
    return {
      title: page.title,
      description: page.intro.slice(0, 155),
      /**
       * The canonical here was correct and hand-rolled, and the hreflang beside
       * it was missing entirely - so these six pages told Google which URL they
       * were but never that an Arabic version existed. Both now come from the
       * one helper the listing pages use.
       */
      alternates: alternatesFor(`/${slug}`, isLocale(locale) ? locale : DEFAULT_LOCALE),
    }
  }

  async function Page({ params }: ContentRouteProps) {
    const { locale } = await params
    if (!isLocale(locale)) notFound()
    setRequestLocale(locale)

    /**
     * Null is unreachable: the slug is a literal checked by the compiler against
     * the keys of CONTENT_PAGES. The check is here so that deleting a page from
     * lib/pages gives a 404 rather than a crash on a live route.
     */
    const page = contentPage(slug, locale)
    if (!page) notFound()

    return <ContentPageView page={page} />
  }

  return { generateMetadata, Page }
}
