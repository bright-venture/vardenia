import type { Metadata } from 'next'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { DEFAULT_LOCALE, formatDate, isLocale, type Locale } from '@vardenia/i18n'
import { alternatesFor } from '../../../../../lib/seo'
import { Link } from '../../../../../i18n/routing'
import { findIssues } from '../../../../../lib/issues'
import { resolveImage } from '../../../../../lib/media'

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
  return {
    title: t('magazine.issues'),
    description: t('magazine.printArchive'),
    alternates: alternatesFor('/magazine/issues', isLocale(locale) ? locale : DEFAULT_LOCALE),
  }
}

export default async function IssuesPage({ params }: Props) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  setRequestLocale(locale)

  const t = await getTranslations()
  const result = await findIssues(locale)

  return (
    <main className="mx-auto max-w-6xl px-6 py-16">
      <header>
        <Link href="/magazine" className="text-gold-700 text-xs uppercase tracking-[0.2em]">
          {t('magazine.title')}
        </Link>
        <h1 className="font-display text-ink-900 mt-3 text-4xl md:text-5xl">
          {t('magazine.issues')}
        </h1>
      </header>

      {result.docs.length === 0 ? (
        <p className="text-ink-500 mt-16 text-center">{t('magazine.noIssues')}</p>
      ) : (
        <div className="mt-10 grid gap-8 sm:grid-cols-3 lg:grid-cols-4">
          {result.docs.map((issue) => {
            const cover = resolveImage(issue.cover as never, 'portrait')
            return (
              <article key={issue.id}>
                <Link href={`/magazine/issues/${issue.slug}`} className="group block">
                  <div className="bg-surface-sunken relative aspect-[3/4] overflow-hidden">
                    {cover ? (
                      <Image
                        src={cover.src}
                        alt={cover.alt}
                        fill
                        sizes="(max-width: 768px) 50vw, 25vw"
                        className="object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : null}
                  </div>
                  <p className="text-ink-500 mt-3 text-xs uppercase tabular-nums tracking-widest">
                    {t('magazine.issueNumber', { number: issue.issueNumber })}
                  </p>
                  <h2 className="font-display text-ink-900 mt-1 text-xl leading-snug">
                    {issue.title}
                  </h2>
                  {issue.publishedAt ? (
                    <time className="text-ink-500 mt-1 block text-xs" dateTime={issue.publishedAt}>
                      {formatDate(new Date(issue.publishedAt), locale as Locale)}
                    </time>
                  ) : null}
                </Link>
              </article>
            )
          })}
        </div>
      )}
    </main>
  )
}
