import { PageHero } from '../../../../../components/editorial/PageHero'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { DEFAULT_LOCALE, formatDate, isLocale, type Locale } from '@vardenia/i18n'
import { buildMetadata } from '../../../../../lib/seo'
import { Link } from '../../../../../i18n/routing'
import { findIssues } from '../../../../../lib/issues'
import { MagazineCover } from '../../../../../components/magazine/MagazineCover'

/**
 * The archive. Every printed edition, newest first.
 *
 * Covers are portrait because magazines are, and showing them at the shape they
 * were designed for is most of what makes an archive page feel like one.
 */

// Cached for an hour and regenerated in the background. See magazine/page.tsx.
export const revalidate = 3600

interface Props {
  params: Promise<{ locale: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale })
  return buildMetadata({
    seo: undefined,
    title: t('magazine.issues'),
    description: t('magazine.printArchive'),
    path: '/magazine/issues',
    locale: isLocale(locale) ? locale : DEFAULT_LOCALE,
  })
}

export default async function IssuesPage({ params }: Props) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  setRequestLocale(locale)

  const t = await getTranslations()
  const result = await findIssues(locale)

  return (
    <main className="vd-magazine-index vd-magazine-issues">
      <PageHero
        title={t('magazine.issues')}
        intro={t('magazine.printArchive')}
        place={3}
        locale={locale}
      >
        <Link href="/magazine" className="vd-text-link">
          {t('magazine.title')} <span aria-hidden>↗</span>
        </Link>
      </PageHero>
      <div className="vd-editorial-results">
        {result.docs.length === 0 ? (
          <p className="vd-archive-empty text-ink-500 mt-16">{t('magazine.noIssues')}</p>
        ) : (
          <div className="vd-issue-grid mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {result.docs.map((issue) => {
              return (
                <article className="vd-issue-card" key={issue.id} data-vd-reveal>
                  <Link href={`/magazine/issues/${issue.slug}`} className="group block">
                    <MagazineCover
                      media={issue.cover as never}
                      sizes="(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 33vw"
                    />
                    <p className="text-ink-500 mt-3 text-xs uppercase tabular-nums tracking-widest">
                      {t('magazine.issueNumber', { number: issue.issueNumber })}
                    </p>
                    <h2 dir="auto" className="font-display text-ink-900 mt-1 text-xl leading-snug">
                      {issue.title}
                    </h2>
                    {issue.publishedAt ? (
                      <time
                        className="text-ink-500 mt-1 block text-xs"
                        dateTime={issue.publishedAt}
                      >
                        {formatDate(new Date(issue.publishedAt), locale as Locale)}
                      </time>
                    ) : null}
                  </Link>
                </article>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
