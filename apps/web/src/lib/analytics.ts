/**
 * Page analytics, and the one question this site has to be able to answer.
 *
 * There was none at all. That is a business gap more than a technical one: the
 * pitch to an advertiser is "a printed code brings a reader to your listing",
 * and until now nothing could say whether anybody arrived, let alone whether
 * they went on to book.
 *
 * Scan events already record the printed side - see collections/ScanEvents -
 * but they stop at the redirect. What happens after it is what this measures.
 *
 * # Why not Google Analytics
 *
 * GA sets cookies, which means a consent banner, which means building and
 * maintaining one, and a banner on a site with no traffic yet is a worse first
 * impression than no analytics. Plausible and Umami are both cookieless and
 * measure what a directory actually needs: pages, referrers, and a handful of
 * named events.
 *
 * # Why the vendor is not hard-coded
 *
 * The two are configured almost identically - a deferred script and one data
 * attribute - and the choice between them is about price rather than fit, which
 * is not a decision this file should make on somebody's behalf. Set the
 * variables for whichever account exists and the other stays dormant.
 *
 * Nothing loads when nothing is configured, so development and preview deploys
 * stay out of the numbers by default rather than by remembering to.
 */

export interface AnalyticsConfig {
  src: string
  /** Plausible identifies a site by domain, Umami by id. Exactly one is used. */
  domain: string | null
  websiteId: string | null
}

/**
 * The configured provider, or null.
 *
 * Read from `NEXT_PUBLIC_` variables because the script tag is rendered into
 * the page. Nothing secret belongs here - a site id is public the moment the
 * script loads, for every analytics product there is.
 */
export function analyticsConfig(
  src = process.env.NEXT_PUBLIC_ANALYTICS_SRC,
  domain = process.env.NEXT_PUBLIC_ANALYTICS_DOMAIN,
  websiteId = process.env.NEXT_PUBLIC_ANALYTICS_WEBSITE_ID,
): AnalyticsConfig | null {
  const source = src?.trim()
  if (!source) return null

  const site = domain?.trim() || null
  const id = websiteId?.trim() || null

  // A script with neither identifier attached measures nothing and silently
  // reports to whatever the endpoint defaults to. Treated as unconfigured.
  if (!site && !id) return null

  return { src: source, domain: site, websiteId: id }
}

/** The events worth naming. Kept small on purpose - see the note below. */
export type AnalyticsEvent =
  'booking-requested' | 'listing-viewed-from-print' | 'directory-filtered'

/**
 * Record a named event, if analytics is loaded at all.
 *
 * Both providers expose a global once their script runs, under different names.
 * Neither exists during a prerender, on a page loaded before the script, or
 * when nothing is configured - so every call is best effort and none of them
 * can throw into the flow that triggered it. An analytics call that breaks a
 * booking is a far worse bug than a missing data point.
 *
 * # Why so few events
 *
 * Every named event is something somebody has to interpret later. Three that
 * get looked at beat thirty that do not, and the pageview stream already
 * answers most questions without any of this.
 */
export function trackEvent(event: AnalyticsEvent, props?: Record<string, string>): void {
  if (typeof window === 'undefined') return

  try {
    const w = window as typeof window & {
      plausible?: (name: string, options?: { props?: Record<string, string> }) => void
      umami?: { track?: (name: string, data?: Record<string, string>) => void }
    }

    if (typeof w.plausible === 'function') {
      w.plausible(event, props ? { props } : undefined)
      return
    }

    w.umami?.track?.(event, props)
  } catch {
    // Deliberately silent. Nothing downstream of a booking should notice.
  }
}
