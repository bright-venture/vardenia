import type { Metadata } from 'next'
import Link from 'next/link'
import { FONT_VARIABLES } from './fonts'
import { RecoveryView } from '../components/editorial/RecoveryView'
import { CinematicGrade } from '../components/journey/CinematicGrade'
import './recovery.css'
export const metadata: Metadata = {
  title: 'Page not found | Vardenia',
  robots: { index: false, follow: false },
}
/** Separate document because unmatched routes have no common root layout. */
export default function RootNotFound() {
  return (
    <html lang="en" className={FONT_VARIABLES}>
      <body className="vd-recovery-body">
        <CinematicGrade />
        <RecoveryView
          title="This page does not exist"
          body="The link may have changed, or the page may have been removed. Try the directory or the magazine instead."
        >
          <p dir="rtl" lang="ar">
            هذه الصفحة غير موجودة. ربما تغيّر الرابط أو أُزيلت الصفحة.
          </p>
          <div className="vd-recovery-actions">
            <Link href="/directory">Browse the directory</Link>
            <Link href="/magazine">The magazine</Link>
          </div>
        </RecoveryView>
      </body>
    </html>
  )
}
