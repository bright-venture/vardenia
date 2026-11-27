import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { isLocale, type Locale } from '@vardenia/i18n'
import { Link } from '../../../../../i18n/routing'
import { MagazineViewer } from '../../../../../components/magazine/MagazineViewer'
import { issueParam } from '../../../../place-submissions/issues/params'

/**
 * The printed magazine as a flipbook, for a business that has chosen a number
 * (`?issue=<id>&number=<n>`): it opens on the page that holds the number.
 * Read-only. Not in the sitemap and not indexed, like the form it is reached from.
 */

interface Props {
  params: Promise<{ locale: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  const t = await getTranslations({ locale, namespace: 'magazineViewer' })
  return { title: t('title'), robots: { index: false, follow: false } }
}

const one = (value: string | string[] | undefined) => (typeof value === 'string' ? value : null)

export default async function MagazineViewPage({ params, searchParams }: Props) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  setRequestLocale(locale)
  const t = await getTranslations('magazineViewer')
  const query = await searchParams
  const issue = issueParam(one(query.issue))
  const number = issueParam(one(query.number))

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="font-display text-ink-900 mb-4 text-2xl">{t('title')}</h1>
      {issue === null ? (
        <div className="text-ink-900">
          <p>{t('chooseIssue')}</p>
          <Link
            href="/magazine-places"
            className="focus-visible:outline-gold-500 mt-4 inline-flex min-h-11 items-center underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            {t('openForm')}
          </Link>
        </div>
      ) : (
        <MagazineViewer issueId={issue} locale={locale as Locale} highlight={number} />
      )}
    </main>
  )
}
