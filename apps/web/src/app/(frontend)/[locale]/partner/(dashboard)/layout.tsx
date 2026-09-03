import { getTranslations, setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { isLocale } from '@vardenia/i18n'
import { Link } from '../../../../../i18n/routing'
import { currentOwner, ownerListings } from '../../../../../lib/session'
import { SignOutButton } from '../../../../../components/SignOutButton'
import { PartnerTabs } from '../../../../../components/PartnerTabs'

/**
 * The chrome around the partner dashboard: who you are, and which part of it.
 *
 * # Why there are tabs now
 *
 * There were not, and the page had grown to four stacked sections - the
 * reservation book, then the QR code, then closed dates - which meant a
 * restaurant checking tonight's covers scrolled past a print asset and a holiday
 * planner to get there, every time. Sections a person reads daily and sections
 * they touch once a season do not belong on one scroll.
 *
 * # Two routes, not a toggle
 *
 * `/partner` and `/partner/listing` are real addresses, the same choice the
 * booking filters made and for the same reason: a view somebody can bookmark,
 * reload and send to whoever answers the phone. A `?tab=` would have been fewer
 * files and would have made the back button do the wrong thing.
 *
 * # In a route group, so the sign-in pages do not inherit it
 *
 * `/partner/login`, `/partner/forgot` and `/partner/reset` live beside these and
 * must not get a header naming a business or tabs leading behind the login.
 * `(dashboard)` wraps the two signed-in views without appearing in any URL.
 */

export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  setRequestLocale(locale)

  const t = await getTranslations('partner')
  const owner = await currentOwner()

  /**
   * Signed out gets no chrome at all - each page below renders its own sign-in
   * prompt. A header reading "For partners" over an empty page, with tabs that
   * lead to two more empty pages, describes an account the reader does not have.
   */
  if (!owner) return children

  const listings = await ownerListings()

  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      {/*
        Titled with the business, not the account.

        It said `owner.email` here, which tells a restaurant owner what they
        typed to get in rather than whose book they are reading. The email sits
        under it, small, where it belongs: it identifies the session, not the
        page. Several listings are joined rather than switched between - a
        switcher is worth building when somebody actually has six.
      */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-gold-700 font-mono text-[11px] uppercase tracking-[0.16em]">
            {t('eyebrow')}
          </p>
          <h1 className="text-ink-900 mt-2 text-3xl">
            {listings.length > 0 ? listings.map((l) => l.name).join(' · ') : t('title')}
          </h1>
          <p className="text-ink-500 mt-2 text-sm">{owner.email}</p>
        </div>
        <SignOutButton collection="business-users" redirectTo="/partner/login" />
      </header>

      <PartnerTabs bookings={t('tabBookings')} listing={t('tabListing')} />

      {/* An account staff have not yet attached a listing to. It authenticates
          perfectly and can see nothing, which without a word of explanation
          looks like the page is broken. Shown here rather than on one tab,
          because it is the reason both of them are empty. */}
      {owner.businessIds.length === 0 ? (
        <p className="border-ink-100 text-ink-700 mt-8 border-s-2 ps-4 text-sm">
          {t('noListings')}
        </p>
      ) : null}

      {children}

      {/* The way back to the public site. Small, at the bottom, because it
          leaves the dashboard. */}
      <p className="border-ink-100 mt-16 border-t pt-6 text-sm">
        <Link href="/directory" className="text-ink-500 hover:text-gold-700 transition-colors">
          {t('backToSite')}
        </Link>
      </p>
    </main>
  )
}
