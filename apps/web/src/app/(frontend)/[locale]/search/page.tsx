import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { useTranslations } from 'next-intl'
import { isLocale } from '@vardenia/i18n'
import { Link } from '../../../../i18n/routing'
import { search } from '../../../../lib/search'
import { ListingGrid } from '../../../../components/ListingGrid'
import { ArticleCard } from '../../../../components/ArticleCard'
import { SearchForm } from '../../../../components/SearchForm'
import { Eyebrow } from '../../../../components/ui'

/**
 * Search across listings and editorial.
 *
 * # Dynamic, and noindex
 *
 * A search result page is generated from whatever somebody typed. Indexing it
 * lets a crawler wander an unbounded space of near-identical pages, and worse,
 * lets anybody put words on our domain by linking to a query - the classic way a
 * search page becomes a spam vector. `robots: noindex, follow` keeps the links
 * out of it useful while keeping the page itself out of the index.
 *
 * # No results is a real state, not an error
 *
 * With a young catalogue most searches will find nothing, and that has to read
 * as "nothing matched" with somewhere to go next, rather than as a broken page.
 */

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ q?: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale })
  return {
    title: t('search.title'),
    robots: { index: false, follow: true },
  }
}

export default async function SearchPage({ params, searchParams }: Props) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  setRequestLocale(locale)

  const { q } = await searchParams
  const t = await getTranslations()
  const results = await search({ locale, q: q ?? '' })

  return (
    <main className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
      <header>
        <Eyebrow>{t('common.brand')}</Eyebrow>
        {/*
          The same masthead treatment the directory got: a mono kicker over a
          title set as large as the page can carry. A search page is a real
          destination on this site - the header links to it and the home page
          submits to it - and at `text-4xl` it read as a utility screen bolted
          onto the side of the product.
        */}
        <h1 className="text-ink-900 mt-3 text-5xl leading-none lg:text-7xl">{t('search.title')}</h1>
        <div className="mt-10 max-w-2xl">
          <SearchForm locale={locale} initial={results.query ?? ''} />
        </div>
      </header>

      {results.query === null ? (
        <Prompt />
      ) : results.total === 0 ? (
        <NoResults query={results.query} />
      ) : (
        <>
          {/*
            Mono, because it is a count rather than a sentence, and it is the
            one line telling the reader their query was understood. `dir="auto"`
            on the quoted term: somebody who typed Arabic into the box should
            see it back the way they typed it.
          */}
          <p
            dir="auto"
            className="text-ink-500 mt-14 font-mono text-[11px] uppercase tracking-[0.16em]"
          >
            {t('search.resultCount', { count: results.total, query: results.query })}
          </p>

          {results.listings.totalDocs > 0 ? (
            <section className="mt-8">
              <h2 className="text-ink-900 text-3xl">{t('search.places')}</h2>
              <div className="mt-8">
                <ListingGrid
                  listings={results.listings.docs}
                  locale={locale}
                  // Listings are the first block of results on the page.
                  eager
                  empty={t('search.nothing')}
                />
              </div>
            </section>
          ) : null}

          {results.articles.totalDocs > 0 ? (
            <section className="border-ink-100 mt-16 border-t pt-10">
              <h2 className="text-ink-900 text-3xl">{t('search.reading')}</h2>
              <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {results.articles.docs.map((article) => (
                  <ArticleCard
                    key={article.id}
                    slug={article.slug ?? ''}
                    title={article.title ?? ''}
                    excerpt={article.excerpt}
                    kind={article.kind}
                    heroImage={article.heroImage as never}
                    publishedAt={article.publishedAt}
                    locale={locale}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}
    </main>
  )
}

/** Before anything has been typed. */
function Prompt() {
  const t = useTranslations('search')
  return (
    <p className="font-display text-ink-500 mt-14 max-w-lg text-2xl leading-snug">{t('prompt')}</p>
  )
}

/**
 * Nothing matched.
 *
 * Offers the directory rather than only apologising: with a catalogue this
 * young, "nothing matched" is usually a fact about us rather than about the
 * search, and browsing is the thing that actually helps.
 */
function NoResults({ query }: { query: string }) {
  const t = useTranslations('search')
  return (
    <div className="mt-14">
      {/* The query set in display type rather than the apology. `dir="auto"` so
          an Arabic term is not reversed inside an English sentence. */}
      <p dir="auto" className="font-display text-ink-700 max-w-lg text-2xl leading-snug">
        {t('noResultsFor', { query })}
      </p>
      <p className="text-ink-500 mt-3 text-sm">{t('noResultsHint')}</p>
      <Link
        href="/directory"
        className="text-gold-700 hover:text-ink-900 mt-6 inline-block underline underline-offset-4"
      >
        {t('browse')}
      </Link>
    </div>
  )
}
