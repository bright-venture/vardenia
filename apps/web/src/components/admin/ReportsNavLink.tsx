'use client'

import Link from 'next/link'

/**
 * The "Tools" block at the bottom of the admin menu.
 *
 * These are pages and files that are not collections, so Payload has nothing to
 * generate a menu entry from. Without this they exist at URLs nobody would
 * guess - which is how a feature ends up built and never used.
 *
 * Most used first. The admin pages open in place; the printable sheet and the
 * two spreadsheets open in a new tab, because they are files rather than pages
 * and navigating away from an edit screen to download one would lose unsaved
 * work.
 */

interface Tool {
  label: string
  href: string
  title: string
  external?: boolean
}

const TOOLS: Tool[] = [
  {
    label: 'Booking fees',
    href: '/admin/billing',
    title: 'Draw up and send the monthly booking-fee statements',
  },
  {
    label: 'Import listings',
    href: '/admin/import-listings',
    title: 'Create listings in bulk from a spreadsheet',
  },
  {
    label: 'QR code sheet',
    href: '/qr/sheet',
    title: 'Every active QR code on one printable page',
    external: true,
  },
  {
    label: 'Listing gaps (CSV)',
    href: '/reports/listings',
    title: 'What every listing is still missing. Sort by Missing to find the emptiest.',
    external: true,
  },
  {
    label: 'Scan report (CSV)',
    href: '/reports/scans',
    title: 'A spreadsheet of QR scans from the last 90 days',
    external: true,
  },
]

export function ReportsNavLink() {
  return (
    <div style={{ marginTop: '1.5rem' }}>
      <div
        style={{
          fontSize: '0.6875rem',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          opacity: 0.6,
          padding: '0 0 0.5rem',
        }}
      >
        Tools
      </div>

      {TOOLS.map((tool) =>
        tool.external ? (
          <a
            key={tool.href}
            href={tool.href}
            target="_blank"
            rel="noopener noreferrer"
            style={linkStyle}
            title={tool.title}
          >
            {tool.label}
          </a>
        ) : (
          <Link key={tool.href} href={tool.href} style={linkStyle} title={tool.title}>
            {tool.label}
          </Link>
        ),
      )}
    </div>
  )
}

const linkStyle: React.CSSProperties = {
  display: 'block',
  padding: '0.25rem 0',
  fontSize: '0.875rem',
  textDecoration: 'none',
  color: 'inherit',
  opacity: 0.85,
}

export default ReportsNavLink
