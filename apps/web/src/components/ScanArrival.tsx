'use client'

import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { QrCode } from 'lucide-react'

/**
 * The line that appears when a reader arrives by scanning a printed code.
 *
 * # Why it exists
 *
 * This is the only moment the paper and the site meet. Somebody pointed a phone
 * at a table card in a restaurant and a web page opened; nothing on that page
 * otherwise acknowledges that anything unusual happened, and for a reader who
 * has never heard of Vardenia the whole product is invisible. One line saying
 * "you scanned a Vardenia code, and this page is kept current" is the entire
 * pitch, delivered at the only instant it is obviously true.
 *
 * It also earns the thing the magazine promises: that the printed page is a
 * pointer to something that stays up to date, rather than a snapshot of the day
 * it was printed.
 *
 * # A client component, on a page that is otherwise entirely server-rendered
 *
 * Reading `searchParams` on the server would make the listing route dynamic and
 * throw away its prerendering - two database round trips on every scan, on the
 * page a scan lands on. That is precisely backwards, so the query string is read
 * in the browser instead.
 *
 * `useSearchParams` is what makes that safe: in a statically rendered route Next
 * requires it to sit inside a Suspense boundary, renders the fallback into the
 * static HTML, and fills this in on the client. The page stays prerendered and
 * this costs one small component in the bundle.
 *
 * # Nothing is rendered for an ordinary visitor
 *
 * Most people arrive from search or from the directory. They get no banner, no
 * empty space, and no layout shift - the element does not exist for them.
 *
 * The marker is put on the URL by /g/[code]; see lib/qr-destination.
 */
export function ScanArrival() {
  const t = useTranslations('directory')
  const arrived = useSearchParams().get('via') === 'qr'

  if (!arrived) return null

  return (
    /*
      `w-fit` as well as `inline-flex`. The masthead this sits in is a flex
      column, so its children stretch to the full width by default and the badge
      came out as a rule across the whole screen. `inline-flex` governs what is
      inside the element; it does not stop the parent stretching it.
    */
    <p className="border-gold-300/50 bg-cedar-900/60 text-gold-300 mb-6 inline-flex w-fit items-center gap-2 border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] backdrop-blur">
      <QrCode className="size-3.5" strokeWidth={1.75} aria-hidden />
      {t('scanArrival')}
    </p>
  )
}
