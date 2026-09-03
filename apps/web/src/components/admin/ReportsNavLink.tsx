'use client'

import Link from 'next/link'

/**
 * A link to the scan report, in the admin sidebar.
 *
 * The report is a CSV route rather than a collection, so Payload has nothing to
 * generate a nav entry from. Without this it exists at a URL nobody would guess
 * - which is how a feature ends up built and never used.
 *
 * Opens in a new tab because it is a file download, not a page: navigating the
 * admin away from an edit screen to trigger a download would lose unsaved work.
 */
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
        Reports
      </div>

      <a
        href="/reports/scans"
        target="_blank"
        rel="noopener noreferrer"
        style={linkStyle}
        title="Downloads a spreadsheet of scans from the last 90 days"
      >
        Scan report (CSV)
      </a>

      <a
        href="/reports/listings"
        target="_blank"
        rel="noopener noreferrer"
        style={linkStyle}
        title="What every listing is still missing. Sort by Missing to find the emptiest."
      >
        Listing gaps (CSV)
      </a>

      <a
        href="/qr/sheet"
        target="_blank"
        rel="noopener noreferrer"
        style={linkStyle}
        title="Every active QR code on one printable page"
      >
        QR code sheet
      </a>

      {/*
       * A Link and not a new tab, unlike the two above. Those are file
       * downloads on routes Next does not own; this is a page in the admin
       * panel, and it holds a job that runs for minutes - a tab somebody opened
       * and forgot is a tab they will close mid-import.
       */}
      <Link
        href="/admin/import-listings"
        style={linkStyle}
        title="Create listings in bulk from a spreadsheet"
      >
        Import listings (CSV)
      </Link>
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
