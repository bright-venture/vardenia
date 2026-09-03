'use client'

import { usePathname } from 'next/navigation'
import { Link } from '../i18n/routing'

/**
 * The two halves of the dashboard.
 *
 * # Why this is a client component when almost nothing here is
 *
 * Only to know which tab is current. A server layout cannot read the pathname,
 * and the alternative - passing it down from each page - means every new page
 * has to remember to, which is the kind of thing that gets forgotten and shows
 * up as no tab looking selected.
 *
 * # Underlined, not boxed
 *
 * The page already carries chips for the booking filters and buttons for the
 * actions. A third boxed control would compete with both. An underline says
 * "you are here" without adding a fourth shape.
 */

export function PartnerTabs({ bookings, listing }: { bookings: string; listing: string }) {
  const pathname = usePathname()

  /**
   * Matched on the ending rather than on equality, because the locale prefix is
   * `as-needed`: the same tab is `/partner/listing` in English and
   * `/ar/partner/listing` in Arabic. Comparing whole paths would leave the
   * Arabic dashboard with nothing highlighted.
   */
  const onListing = pathname.endsWith('/partner/listing')

  return (
    <nav className="border-ink-100 mt-8 flex gap-6 border-b" aria-label={bookings}>
      <Tab href="/partner" active={!onListing}>
        {bookings}
      </Tab>
      <Tab href="/partner/listing" active={onListing}>
        {listing}
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
      className={`-mb-px border-b-2 pb-3 text-sm transition-colors ${
        active
          ? 'border-cedar-900 text-ink-900'
          : 'text-ink-500 hover:text-ink-900 border-transparent'
      }`}
    >
      {children}
    </Link>
  )
}
