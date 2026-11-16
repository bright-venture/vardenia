import type { Metadata } from 'next'
import QRCode from 'qrcode'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { DEFAULT_LOCALE, isLocale } from '@vardenia/i18n'
import { alternatesFor } from '../../../lib/seo'
import { requireLocale } from '../../../lib/require-locale'
import { findListings, findFeaturedListings, printedCodes } from '../../../lib/listings'
import { findHomeListings } from '../../../lib/home-listings'
import { findIssues } from '../../../lib/issues'
import { resolveImage, resolvePhotograph } from '../../../lib/media'
import { getPathname } from '../../../i18n/routing'
import { QR_LIGHT } from '../../../lib/qr-image'
import { CinematicJourney } from '../../../components/journey/CinematicJourney'
import { MagazineArt } from '../../../components/journey/MagazineArt'
import { HomePlaces } from '../../../components/home/HomePlaces'
import { HomeSelection } from '../../../components/home/HomeSelection'
import { Manifesto } from '../../../components/home/Manifesto'
import { PrintConnection } from '../../../components/home/PrintConnection'
import { hiddenPages } from '../../../lib/hidden-pages'

export const revalidate = 3600
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  return { alternates: alternatesFor('/', isLocale(locale) ? locale : DEFAULT_LOCALE) }
}
/** Published directory/editorial content; visual-review samples live only in review/. */
export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params
  const locale = requireLocale(raw)
  setRequestLocale(locale)
  const j = await getTranslations('journey')
  const t = await getTranslations('homeFinish')
  const [listings, featured, issues, hidden] = await Promise.all([
    findListings({ locale, perPage: 6 }),
    findFeaturedListings({ locale }),
    findIssues(locale),
    hiddenPages(),
  ])
  // Pages the admin has hidden (lib/hidden-pages) are never linked to.
  const directoryShown = !hidden.includes('directory')
  const magazineShown = !hidden.includes('magazine')
  const issuesShown = !hidden.includes('magazine-issues')
  // The automatic selection, never repeating a gold listing already in the band above.
  const selected = await findHomeListings({ locale, excludedIds: featured.map((doc) => doc.id) })
  const issue = issues.docs[0]
  const cover = issue ? resolveImage(issue.cover as never, 'portrait') : null
  const pictured = [...featured, ...listings.docs].filter((doc) =>
    resolvePhotograph(doc.heroImage as never),
  )
  const codes = await printedCodes(pictured.map((doc) => doc.id))
  const connected = pictured.find((doc) => codes.has(doc.id))
  const code = connected ? codes.get(connected.id) : null
  const magazineHref = getPathname({ locale, href: '/magazine' })
  /**
   * The code and the link open the listing page itself, never /g/<code>.
   *
   * /g is the printed code's redirect, and every request to it is recorded as
   * a magazine scan: the venue's scan count, the scan reports sold to
   * advertisers, and the "already printed" lock on the code all read it. A
   * reader clicking through from the homepage, or pointing a phone at this
   * on-screen code, has not scanned the magazine, so neither may go through it.
   * A fallback opens the magazine, never a fabricated venue.
   */
  const listingHref =
    connected && code && connected.slug
      ? getPathname({ locale, href: `/directory/${connected.slug}` })
      : null
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://vardenia.com'
  const targetUrl = new URL(listingHref ?? magazineHref, site).href
  const qr = await QRCode.toDataURL(targetUrl, {
    width: 360,
    margin: 4,
    color: { dark: '#111d2d', light: QR_LIGHT },
  })
  const target = {
    title: listingHref && connected ? (connected.name ?? '') : t('magazineName'),
    image: listingHref && connected ? resolvePhotograph(connected.heroImage as never) : cover,
    href: listingHref ?? magazineHref,
    liveCode: Boolean(listingHref),
  }
  return (
    <main className="vd-main-home">
      <CinematicJourney
        locale={locale}
        directoryShown={directoryShown}
        magazineShown={magazineShown}
        directory={
          <>
            <HomePlaces
              listings={featured}
              locale={locale}
              featured
              directoryShown={directoryShown}
              magazineShown={magazineShown}
            />
            <HomeSelection listings={selected} locale={locale} directoryShown={directoryShown} />
          </>
        }
        connection={
          <>
            <Manifesto />
            <PrintConnection qr={qr} target={target} />
          </>
        }
        magazine={
          <MagazineArt
            title={issue?.title ?? t('magazineName')}
            // The current issue, else the magazine page, else no link at all.
            href={
              issue && issuesShown
                ? `/magazine/issues/${issue.slug}`
                : magazineShown
                  ? '/magazine'
                  : null
            }
            openLabel={issue && issuesShown ? t('openIssue') : j('readMagazine')}
          />
        }
      />
    </main>
  )
}
