'use client'
import { Link, usePathname } from '../../i18n/routing'

/**
 * "Homepage" in the header (Header-Homepage-Button.html, 11 November 2026):
 * the first item of the desktop nav, before Discover, and the first row of the
 * phone menu after the search. The wordmark already leads home; this says so in
 * words.
 *
 * A client component only for `aria-current`: the header is prerendered, so the
 * page it sits on is known in the browser. `usePathname` gives the path without
 * the locale, so "/" is the homepage in every language, and the locale-aware
 * Link sends an Arabic reader to /ar. The phone menu closes itself when a link
 * in it is followed (MobileMenu).
 */
export function HomepageLink({ label, className }: { label: string; className: string }) {
  const pathname = usePathname()
  return (
    <Link
      href="/"
      prefetch={false}
      className={className}
      aria-current={pathname === '/' ? 'page' : undefined}
    >
      {label}
    </Link>
  )
}
