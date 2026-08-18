import type { MetadataRoute } from 'next'
import { isIndexingAllowed } from '../lib/indexing'

/**
 * What crawlers may and may not visit.
 *
 * The disallow list is not about secrecy - access control does that, and `/admin`
 * already refuses anonymous requests. It is about not wasting a crawler's budget
 * and not letting the wrong pages compete in search results:
 *
 *  - `/admin` and `/api` are Payload's. Nothing there belongs in an index.
 *  - `/g/` are the printed QR redirects. Every one is a 302 to a page already in
 *    the sitemap, so crawling them indexes nothing new and inflates scan counts
 *    with traffic that is not readers.
 *  - `/qr/` serves code images and the staff print sheet.
 *  - `/scan/` are the fallbacks a broken code lands on. They are a safety net,
 *    not content, and a "we could not find that code" page ranking for the brand
 *    would be embarrassing.
 *
 * `/directory?category=` is deliberately NOT blocked. Those are real, useful,
 * linkable pages - "hotels in Lebanon" is exactly a search someone runs.
 */
export default function robots(): MetadataRoute.Robots {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '')

  /**
   * Held back until the directory has something in it. See lib/indexing.
   *
   * The sitemap is withheld too. Leaving it advertised would be inviting a
   * crawler to the exact list of pages we are asking it not to take, and the
   * sitemap is generated from the database, so right now it is a list of almost
   * nothing.
   *
   * Note this is the weaker half of the mechanism, not the whole of it.
   * `Disallow` stops a page being *fetched*, which also stops the `noindex` on
   * it being read - and a URL that is linked from somewhere else can still be
   * listed on the strength of that link alone. The `noindex` metadata is what
   * actually keeps pages out of the index; this saves crawl budget and states
   * the intent. Both are emitted because they fail in different directions.
   */
  if (!isIndexingAllowed()) {
    return {
      rules: [{ userAgent: '*', disallow: '/' }],
      host: base,
    }
  }

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/api/', '/g/', '/qr/', '/reports/', '/scan/'],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  }
}
