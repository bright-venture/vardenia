import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'
import { PageHero } from '../../../../../components/editorial/PageHero'
import { ListingGrid } from '../../../../../components/ListingGrid'
import { BYBLOS_GUIDE_PATH, directoryFor } from '../../../../../components/journey/destinations'
import { Link } from '../../../../../i18n/routing'
import { hiddenPages } from '../../../../../lib/hidden-pages'
import { findIssueBySlug } from '../../../../../lib/issues'
import { findListings } from '../../../../../lib/listings'
import { buildMetadata } from '../../../../../lib/seo'

export const revalidate = 3600
const title = 'Byblos (Jbeil) travel guide'
const description =
  'Walk from the old harbour through the souk to the archaeological site in Byblos, Lebanon. Discover places to eat and stay in the wider Jbeil district.'
const cityHref = directoryFor({ where: 'jbeil' })
const stops = [
  [
    'The old harbour',
    'Begin at the water. Follow the quay past the fishing boats, then turn inland towards the stone lanes of the old town. Save a waterside table for the way back.',
  ],
  [
    'The old souk',
    'Leave the waterfront for the market lanes. Browse the small shops or stop for coffee before continuing towards the castle. This is the stretch to linger over if you have no fixed schedule.',
  ],
  [
    'The archaeological site',
    'At the castle, the walk changes scale. The Crusader walls share the site with much earlier remains, including Bronze Age temples. Check admission and opening hours before making this your final stop.',
  ],
]
type Props = { params: Promise<{ locale: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  if ((await params).locale !== 'en') notFound()
  const meta = buildMetadata({
    seo: undefined,
    title,
    description,
    path: BYBLOS_GUIDE_PATH,
    locale: 'en',
  })
  const images = [
    { url: '/journey/byblos-hero.webp', alt: 'Fishing boats in the old harbour of Byblos' },
  ]
  return {
    ...meta,
    alternates: { canonical: BYBLOS_GUIDE_PATH },
    openGraph: { ...meta.openGraph, images },
    twitter: { ...meta.twitter, images },
  }
}

export default async function ByblosGuide({ params }: Props) {
  if ((await params).locale !== 'en') notFound()
  setRequestLocale('en')
  const hidden = await hiddenPages()
  const showDirectory = !hidden.includes('directory')
  const [places, issue] = await Promise.all([
    showDirectory ? findListings({ locale: 'en', city: 'jbeil', perPage: 3 }) : null,
    hidden.includes('magazine-issues') ? null : findIssueBySlug('all-lebanon', 'en'),
  ])
  return (
    <main className="vd-page-flow">
      <PageHero
        locale="en"
        title="Byblos (Jbeil)"
        intro="On the Lebanese coast north of Beirut, fishing boats, market lanes and a Crusader castle sit within one walk. Start at the old harbour and take the slow route inland."
      >
        <a className="vd-button" href="#old-town-walk">
          Walk the old town
        </a>
      </PageHero>
      <div className="mx-auto max-w-7xl px-6 pb-20 lg:px-12">
        <section id="old-town-walk" className="border-ink-100 scroll-mt-32 border-t py-14">
          <h2 className="font-display text-ink-900 text-4xl lg:text-5xl">From harbour to castle</h2>
          <ol className="mt-10 grid gap-8 lg:grid-cols-3 lg:gap-12">
            {stops.map(([name, body]) => (
              <li key={name} className="border-ink-300 border-t pt-5">
                <h3 className="font-display text-2xl">{name}</h3>
                <p className="mt-3 leading-relaxed">{body}</p>
              </li>
            ))}
          </ol>
          <p className="text-ink-500 mt-7 text-sm">
            Read more about{' '}
            <a
              className="underline"
              href="https://www.jbail-byblos.gov.lb/baldati/project.php?id=12&amp;la=en"
            >
              the souk from the Municipality of Byblos
            </a>{' '}
            and{' '}
            <a className="underline" href="https://whc.unesco.org/en/list/295/">
              the archaeological site from UNESCO
            </a>
            .
          </p>
        </section>
        {places && places.docs.length > 0 && (
          <section className="border-ink-100 border-t py-14">
            <h2 className="font-display text-4xl lg:text-5xl">Around Jbeil</h2>
            <p className="mb-8 mt-4 max-w-prose">
              These places are spread across the wider city. Open a listing to see its location
              before adding it to your day.
            </p>
            <ListingGrid listings={places.docs} locale="en" kind="related" empty="" />
            <Link className="vd-button mt-8" href={cityHref}>
              Browse the Jbeil directory
            </Link>
          </section>
        )}
        <nav
          id="continue-exploring"
          aria-label="Continue exploring"
          className="border-ink-100 flex scroll-mt-32 flex-wrap gap-8 border-t pt-8"
        >
          <Link className="underline" href="/#ways">
            Back to the scenic way
          </Link>
          {!hidden.includes('eat-and-drink') && (
            <Link className="underline" href={cityHref.replace('/directory', '/eat-and-drink')}>
              Eat &amp; Drink in Jbeil
            </Link>
          )}
          {issue && (
            <Link className="underline" href="/magazine/issues/all-lebanon">
              Read the All Lebanon issue
            </Link>
          )}
        </nav>
      </div>
    </main>
  )
}
