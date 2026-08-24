'use client'

import { colors } from '@vardenia/tokens'

/**
 * The last resort: an error thrown by a root layout itself.
 *
 * When this fires, the layout that normally provides `<html>`, the site header
 * and the translation context never rendered, so this file has to supply the
 * document shell on its own and cannot use anything from next-intl.
 *
 * English only, deliberately. Reaching this point means the locale machinery is
 * part of what failed, and guessing a language from a broken request would be
 * inventing certainty we do not have. It should also be close to unreachable -
 * the per-page boundary in `[locale]/error.tsx` catches everything short of the
 * layout collapsing.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
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
          background: colors.surface.raised,
          color: colors.ink[900],
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
              color: colors.gold[700],
            }}
          >
            Vardenia
          </p>
          <h1 style={{ margin: '1rem 0 0', fontSize: '2rem', lineHeight: 1.2, fontWeight: 400 }}>
            Something went wrong
          </h1>
          <p style={{ margin: '1.25rem 0 0', color: colors.ink[500], lineHeight: 1.6 }}>
            We hit an unexpected problem loading this page. Please try again in a moment.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: '2rem',
              padding: '0.75rem 1.25rem',
              borderRadius: 6,
              border: 'none',
              background: colors.ink[900],
              color: colors.surface.raised,
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
          {error.digest ? (
            <p style={{ marginTop: '2rem', fontSize: 12, color: colors.ink[300] }}>
              Reference: <code>{error.digest}</code>
            </p>
          ) : null}
        </main>
      </body>
    </html>
  )
}
