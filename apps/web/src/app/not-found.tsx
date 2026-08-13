import Link from 'next/link'

/**
 * The 404 for the whole site.
 *
 * A localized version living at `(frontend)/[locale]/not-found.tsx` was written
 * first, so that a 404 would keep the header, footer and language switcher. It
 * never rendered. Every `notFound()` in this app resolves here instead - checked
 * in both a production build and dev - because the route groups mean there is no
 * root layout for a nested boundary to sit inside. That file was deleted rather
 * than left in the tree looking like it worked.
 *
 * So this file supplies the document shell itself, which also rules out
 * next-intl: there is no provider above it. Both languages are printed rather
 * than one guessed, because the URL that got here may never have resolved to a
 * locale at all.
 *
 * Known limitation: for `notFound()` thrown inside a prerendered route, Next
 * sends this as part of the RSC payload rather than server-rendered HTML, so it
 * paints after hydration. The 404 status is correct either way, which is what
 * crawlers act on, and a reader with a phone sees the page.
 */
export default function RootNotFound() {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
          background: '#fbfaf8',
          color: '#1a1a1a',
          fontFamily: 'ui-serif, Georgia, serif',
        }}
      >
        <main style={{ maxWidth: '32rem' }}>
          <p
            style={{
              margin: 0,
              fontSize: 12,
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: '#8a6d3b',
            }}
          >
            Vardenia
          </p>

          <h1 style={{ margin: '1rem 0 0', fontSize: '2rem', lineHeight: 1.2, fontWeight: 400 }}>
            This page does not exist
          </h1>

          <p style={{ margin: '1.25rem 0 0', color: '#6b6b6b', lineHeight: 1.6 }}>
            The link may have changed, or the page may have been removed. Try the directory or the
            magazine instead.
          </p>

          <p
            dir="rtl"
            lang="ar"
            style={{
              margin: '1.5rem 0 0',
              paddingTop: '1.5rem',
              borderTop: '1px solid #e5e0d8',
              color: '#6b6b6b',
              lineHeight: 1.8,
            }}
          >
            هذه الصفحة غير موجودة. ربما تغيّر الرابط أو أُزيلت الصفحة.
          </p>

          <div style={{ marginTop: '2rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <Link
              href="/directory"
              style={{
                padding: '0.75rem 1.25rem',
                borderRadius: 6,
                background: '#1a1a1a',
                color: '#fbfaf8',
                fontSize: 14,
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              Browse the directory
            </Link>
            <Link
              href="/magazine"
              style={{
                padding: '0.75rem 1.25rem',
                borderRadius: 6,
                border: '1px solid #e5e0d8',
                color: '#1a1a1a',
                fontSize: 14,
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              The magazine
            </Link>
          </div>
        </main>
      </body>
    </html>
  )
}
