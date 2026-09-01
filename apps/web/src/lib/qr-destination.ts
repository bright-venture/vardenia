import { sectionForCategory } from '@vardenia/core'
import { isPubliclyVisible, populated, type QrDoc } from './qr-doc'
import { normalizeExternalUrl } from './external-url'

/**
 * Where a scanned code sends the reader.
 *
 * Lifted out of app/g/[code]/route.ts so it can be tested. It was the most
 * consequential function in the product and the only one with no tests, for the
 * mundane reason that a Next route file may only export the handler and a few
 * reserved names - so the function could not be reached from a test without
 * adding an export that Next's own generated types reject.
 *
 * The body is unchanged apart from the `home` case and the base-URL trim.
 *
 * # The rule every branch serves
 *
 * A printed code is permanent and must never 404. Every branch either produces
 * a page that exists or falls back to one that explains itself. None of them may
 * throw: the caller turns a throw into a 500 on a symbol that is already on
 * twenty thousand pages.
 */

/**
 * Trailing slash removed once, here, rather than in six template strings.
 *
 * `NEXT_PUBLIC_SITE_URL` reaches this raw, and a value ending in `/` produced
 * `https://vardenia.com//directory/x`. That works, and looks like a bug to
 * anybody who reads it in a scan log.
 */
const trimmed = (siteUrl: string) => siteUrl.replace(/\/$/, '')

/**
 * Where an unpublished target sends the reader.
 *
 * "Moved" rather than "not found", because that is what happened: the listing
 * existed when the magazine went to print and does not now. The page offers a
 * way onward instead of a dead end.
 */
const movedTo = (siteUrl: string, qr: QrDoc) =>
  `${siteUrl}/scan/moved?code=${encodeURIComponent(qr.code ?? '')}`

/**
 * Adds `?via=qr` so the page a scan lands on knows how the reader got there.
 *
 * # Why the listing page cannot work this out for itself
 *
 * It is prerendered at both locales and served from cache - that is the whole
 * reason a scan costs about 5ms instead of two round trips to Frankfurt. Reading
 * `searchParams` on the server would undo that. So the marker is put on the URL
 * here and read in the browser, where it costs nothing.
 *
 * # Best effort, and that word is load-bearing
 *
 * This runs inside the one route whose stated rule is that it must never fail: a
 * printed code is on paper for a year and cannot be recalled. So every failure
 * mode returns the destination untouched rather than throwing. A reader who
 * would have got to the right page still gets there; the only thing lost is a
 * banner.
 *
 * # Same origin only
 *
 * An `external` code sends the reader to somebody else's site, and appending our
 * analytics marker to a third party's URL is both useless and rude - it can also
 * collide with a parameter that site already uses.
 */
export function markScanArrival(destination: string, rawSiteUrl: string): string {
  try {
    const url = new URL(destination)
    if (url.origin !== new URL(rawSiteUrl).origin) return destination
    url.searchParams.set('via', 'qr')
    return url.toString()
  } catch {
    return destination
  }
}

export function resolveDestination(qr: QrDoc, rawSiteUrl: string): string {
  const siteUrl = trimmed(rawSiteUrl)

  switch (qr.targetType) {
    /**
     * Published targets only.
     *
     * This lookup runs with access control bypassed - it has to, because
     * qr-codes is staff-only and the reader is anonymous - so it sees drafts
     * that the destination page will refuse to render. Without the check, a
     * listing unpublished after the magazine shipped sent every scan of a
     * printed code to a 404.
     *
     * That was not hypothetical: the `active` checkbox on a code exists to send
     * retired codes to /scan/moved, but unpublishing the *listing* is a
     * different screen and skipped the safety net entirely. Unpublishing is the
     * common action; remembering to also retire the code is not.
     */
    case 'business': {
      const doc = populated(qr.business)
      if (!doc?.slug) return `${siteUrl}/scan/not-found`
      if (!isPubliclyVisible(doc)) return movedTo(siteUrl, qr)
      return `${siteUrl}/directory/${doc.slug}`
    }
    case 'article': {
      const doc = populated(qr.article)
      if (!doc?.slug) return `${siteUrl}/scan/not-found`
      if (!isPubliclyVisible(doc)) return movedTo(siteUrl, qr)
      return `${siteUrl}/magazine/articles/${doc.slug}`
    }
    case 'issue': {
      // Issues have no draft state, so there is nothing to check here.
      const slug = populated(qr.issue)?.slug
      return slug ? `${siteUrl}/magazine/issues/${slug}` : `${siteUrl}/magazine`
    }
    case 'category': {
      /**
       * A printed "scan for every hotel in Lebanon" code, resolved to that
       * category's section page.
       *
       * This used to point at `/directory?category=...`. Changing it is safe in
       * a way that changing a listing URL would not be: what is on the paper is
       * `/g/CODE`, and this function runs fresh on every scan, so codes already
       * in circulation follow the new address without anything being reprinted.
       *
       * A category with no section is impossible - the mapping is exhaustive by
       * type - but the fallback stays, because this is a printed code and a
       * homepage beats a 404.
       */
      const slug = typeof qr.category === 'string' ? qr.category : null
      const section = sectionForCategory(slug)
      return section ? `${siteUrl}/${section.path}` : `${siteUrl}/directory`
    }
    case 'external': {
      // Normalised again rather than trusted: validation covers everything saved
      // from now on, but codes created before it existed, or written through the
      // API, can still hold a bare domain that would throw below.
      const external = normalizeExternalUrl(qr.externalUrl)
      return external ?? `${siteUrl}/scan/not-found`
    }
    /**
     * The site itself. Nothing to look up, nothing to be unpublished, and the
     * only branch here that cannot fail.
     *
     * No locale prefix, matching every other case: `localePrefix` is `as-needed`
     * and `localeDetection` is off, so the bare root is the English homepage.
     * An Arabic reader scanning this lands on English, which is what a printed
     * listing code does too. Changing that is a decision about the whole print
     * product, not about this one branch.
     */
    case 'home':
      return `${siteUrl}/`
    default:
      // A target type with no case here used to land on the homepage, which
      // tells the reader nothing and looks like the code worked. The
      // "we couldn't find this" page at least explains itself and offers a way
      // onward. Reaching this means QR_TARGET_TYPES grew without the resolver
      // growing with it.
      return `${siteUrl}/scan/not-found?code=${qr.code ?? ''}`
  }
}
