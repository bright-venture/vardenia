import type { Metadata } from 'next'
import QRCode from 'qrcode'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { DEFAULT_LOCALE, isLocale } from '@vardenia/i18n'
import { FEATURED_PLACES } from '@vardenia/core'
import { alternatesFor } from '../../../lib/seo'
import { requireLocale } from '../../../lib/require-locale'
import { findListings, findFeaturedListings, printedCodes } from '../../../lib/listings'
import { findIssues } from '../../../lib/issues'
import { resolveImage, resolvePhotograph } from '../../../lib/media'
import { getPathname } from '../../../i18n/routing'
import { scanUrl } from '../../../lib/qr-url'
import { CinematicJourney } from '../../../components/journey/CinematicJourney'
import { MagazineArt } from '../../../components/journey/MagazineArt'
import { HomePlaces } from '../../../components/home/HomePlaces'
import { Manifesto } from '../../../components/home/Manifesto'
import { PrintConnection } from '../../../components/home/PrintConnection'

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
  const [listings, featured, issues] = await Promise.all([
    findListings({ locale, perPage: 6 }),
    findFeaturedListings({ locale, limit: FEATURED_PLACES }),
    findIssues(locale),
  ])
  const issue = issues.docs[0]
  const cover = issue ? resolveImage(issue.cover as never, 'portrait') : null
  const pictured = [...featured, ...listings.docs].filter((doc) =>
    resolvePhotograph(doc.heroImage as never),
  )
  const codes = await printedCodes(pictured.map((doc) => doc.id))
  const connected = pictured.find((doc) => codes.has(doc.id))
  const code = connected ? codes.get(connected.id) : null
  const magazineHref = getPathname({ locale, href: '/magazine' })
  // A fallback code opens the magazine, never a fabricated venue.
  const targetUrl =
    connected && code
      ? scanUrl(code)
      : new URL(magazineHref, process.env.NEXT_PUBLIC_SITE_URL ?? 'https://vardenia.com').href
  const qr = await QRCode.toDataURL(targetUrl, {
    width: 360,
    margin: 4,
    color: { dark: '#111d2d', light: '#ffffff' },
  })
  const target = {
    title: connected && code ? (connected.name ?? '') : t('magazineName'),
    image: connected && code ? resolvePhotograph(connected.heroImage as never) : cover,
    href: connected && code ? `/g/${encodeURIComponent(code)}` : magazineHref,
    liveCode: Boolean(connected && code),
  }
  return (
    <main className="vd-main-home">
      <CinematicJourney
        locale={locale}
        directory={<HomePlaces listings={featured} locale={locale} featured />}
        connection={
          <>
            <Manifesto />
            <PrintConnection qr={qr} target={target} />
          </>
        }
        magazine={
          <MagazineArt
            title={issue?.title ?? t('magazineName')}
            href={issue ? `/magazine/issues/${issue.slug}` : '/magazine'}
            openLabel={issue ? t('openIssue') : j('readMagazine')}
          />
        }
      />
    </main>
  )
}
