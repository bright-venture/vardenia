import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { isLocale, type Locale } from '@vardenia/i18n'
import { Link } from '../../../../../../i18n/routing'
import { currentOwner, ownerClosures, ownerListings } from '../../../../../../lib/session'
import { beirutCalendarDayLabel } from '../../../../../../lib/beirut'
import { LINK, PRIMARY_BUTTON } from '../../../../../../components/formStyles'
import { ClosedDates } from '../../../../../../components/ClosedDates'
import { QrCodePanel } from '../../../../../../components/QrCodePanel'

/**
 * Everything about the listing that is not a booking.
 *
 * The public page, the printed code, and the days the venue is shut. All three
 * are read or changed occasionally - a partner opens this when they print table
 * cards or when they remember they are closed in August - which is exactly why
 * they are no longer stacked underneath the reservation book somebody reads
 * every service.
 *
 * Dynamic and noindex, like the book: it is one account's own page.
 */

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ locale: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'partner' })
  return { title: t('tabListing'), robots: { index: false, follow: false } }
}

export default async function PartnerListingPage({ params }: Props) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  setRequestLocale(locale)

  const t = await getTranslations('partner')
  const owner = await currentOwner()

  if (!owner) {
    return (
      <main className="mx-auto max-w-xl px-6 py-24">
        <p className="text-gold-700 text-xs uppercase tracking-[0.2em]">{t('eyebrow')}</p>
        <h1 className="font-display text-ink-900 mt-3 text-3xl">{t('title')}</h1>
        <p className="text-ink-500 mt-4">{t('signInToSee')}</p>
        <Link href="/partner/login" className={`${PRIMARY_BUTTON} mt-8`}>
          {t('signIn')}
        </Link>
      </main>
    )
  }

  const [listings, closures] = await Promise.all([ownerListings(), ownerClosures()])

  /** Only a published listing has a public page to send anybody to. */
  const published = listings.filter((listing) => listing.published && listing.slug)

  return (
    <>
      {/*
        The way out to their own listing, as the public reads it.

        An owner had no way to see the page they are listed on without hunting
        for it, which meant nobody ever looked - and the listing is the thing
        they are paying for.

        A draft has no public page, so it gets no link rather than a link to a
        404. When a listing exists and none are published, that is said in a
        sentence: silence there reads as a missing feature.
      */}
      <section className="mt-8" aria-labelledby="public-page">
        <h2
          id="public-page"
          className="text-ink-500 font-mono text-[11px] uppercase tracking-[0.14em]"
        >
          {t('publicPageTitle')}
        </h2>

        {published.length > 0 ? (
          <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
            {published.map((listing) => (
              <Link key={listing.id} href={`/directory/${listing.slug}`} className={LINK}>
                {published.length > 1 ? listing.name : t('viewListing')}
              </Link>
            ))}
          </p>
        ) : listings.length > 0 ? (
          <p className="text-ink-500 mt-3 text-sm">{t('notPublishedYet')}</p>
        ) : null}
      </section>

      <QrCodePanel
        listings={listings.map((listing) => ({
          id: listing.id,
          name: listing.name,
          code: listing.code,
        }))}
      />

      {/*
        The dates are formatted here rather than in the client component: they
        are Beirut calendar days, and `beirutCalendarDayLabel` is a server-side
        concern for the same reason every other time on the dashboard is - a
        browser's own timezone must never get a vote on which day a venue said it
        was closed.
      */}
      <ClosedDates
        listings={listings.map((listing) => ({ id: listing.id, name: listing.name }))}
        closures={closures.map((closure) => ({
          id: closure.id,
          business: closure.business,
          label:
            closure.startsOn === closure.endsOn
              ? beirutCalendarDayLabel(closure.startsOn, locale as Locale)
              : t('closedRange', {
                  from: beirutCalendarDayLabel(closure.startsOn, locale as Locale),
                  to: beirutCalendarDayLabel(closure.endsOn, locale as Locale),
                }),
          note: closure.note,
          bookings: closure.bookings,
        }))}
      />
    </>
  )
}
