'use client'
import Link from 'next/link'
import { FONT_VARIABLES } from './fonts'
import { RecoveryView } from '../components/editorial/RecoveryView'
import { CinematicGrade } from '../components/journey/CinematicGrade'
import './recovery.css'
/** Last-resort document, independent of localization and the failed layout. */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en" className={FONT_VARIABLES}>
      <head>
        <title>Something went wrong | Vardenia</title>
      </head>
      <body className="vd-recovery-body">
        <CinematicGrade />
        <RecoveryView
          title="Something went wrong"
          body="We hit an unexpected problem loading this page. Please try again in a moment."
        >
          <div className="vd-recovery-actions">
            <button type="button" onClick={reset}>
              Try again
            </button>
            <Link href="/directory">Browse the directory</Link>
          </div>
          {error.digest ? (
            <p className="vd-recovery-reference">
              Reference: <code>{error.digest}</code>
            </p>
          ) : null}
        </RecoveryView>
      </body>
    </html>
  )
}
