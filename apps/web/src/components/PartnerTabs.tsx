'use client'

import { usePathname } from 'next/navigation'
import { Link } from '../i18n/routing'
import styles from './PartnerTabs.module.css'

/**
 * The sections of the dashboard.
 *
 * # Why this is a client component when almost nothing here is
 *
 * Only to know which tab is current. A server layout cannot read the pathname,
 * and the alternative - passing it down from each page - means every new page
 * has to remember to, which is the kind of thing that gets forgotten and shows
 * up as no tab looking selected.
 *
 * On narrow screens all four destinations stay visible in a two-column grid.
 * A horizontally scrolling row hid the current section when arriving directly
 * on Statements. Desktop keeps the familiar single row without moving focus
 * or scrolling the page on hydration.
 */

export function PartnerTabs({
  bookings,
  listing,
  scans,
  statements,
}: {
  bookings: string
  listing: string
  scans: string
  statements: string
}) {
  const pathname = usePathname()

  /**
   * Matched on the ending rather than on equality, because the locale prefix is
   * `as-needed`: the same tab is `/partner/listing` in English and
   * `/ar/partner/listing` in Arabic. Comparing whole paths would leave the
   * Arabic dashboard with nothing highlighted.
   */
  const onListing = /\/partner\/listing(\/|$)/.test(pathname)
  const onScans = /\/partner\/scans(\/|$)/.test(pathname)
  // Includes a single statement, /partner/statements/12, so the tab stays lit there.
  const onStatements = /\/partner\/statements(\/|$)/.test(pathname)

  return (
    <nav
      className={`${styles.navigation} vd-partner-tabs border-ink-100 mt-8 gap-6 border-b`}
      aria-label={bookings}
    >
      <Tab href="/partner" active={!onListing && !onScans && !onStatements}>
        {bookings}
      </Tab>
      <Tab href="/partner/listing" active={onListing}>
        {listing}
      </Tab>
      <Tab href="/partner/scans" active={onScans}>
        {scans}
      </Tab>
      <Tab href="/partner/statements" active={onStatements}>
        {statements}
      </Tab>
    </nav>
  )
}

function Tab({
  href,
  active,
  children,
}: {
  href: string
  active: boolean
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      // `-mb-px` pulls the underline onto the nav's own border so the two are one
      // line rather than two a pixel apart.
      className={`focus-visible:outline-gold-500 -mb-px inline-flex min-h-11 shrink-0 items-center border-b-2 pb-3 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 ${
        active
          ? 'border-cedar-900 text-ink-900'
          : 'text-ink-500 hover:text-ink-900 border-transparent'
      }`}
    >
      {children}
    </Link>
  )
}
