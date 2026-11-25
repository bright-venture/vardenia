import type { Metadata } from 'next'
import Image from 'next/image'
import styles from './magazine-places.module.css'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { isLocale, type Locale } from '@vardenia/i18n'
import { PageHero } from '../../../../components/editorial/PageHero'
import { PlaceSubmissionForm } from '../../../../components/places/PlaceSubmissionForm'

/**
 * Where businesses book a place in the printed magazine (19 November 2026).
 * Reached from its own QR code (target "The magazine places page").
 *
 * The English desktop edition opens with a printed spread. The form is
 * the "add your place" submission (components/places): it creates a draft
 * listing with a reserved page number, for the team to review. The team finds
 * them under Directory > Listings, where the State column reads Draft,
 * Published, Rejected or Expired (20 November 2026; the separate "magazine
 * place requests" it replaced were removed).
 * Not in the sitemap and not indexed: it is for businesses holding the code.
 */

interface Props {
  params: Promise<{ locale: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  const t = await getTranslations({ locale, namespace: 'magazinePlaces' })
  return { title: t('title'), robots: { index: false, follow: false } }
}

export default async function MagazinePlacesPage({ params }: Props) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  setRequestLocale(locale)
  const t = await getTranslations('magazinePlaces')

  return (
    <main className={locale === 'en' ? styles.page : undefined}>
      <PageHero title={t('title')} intro={t('intro')} place={3} locale={locale as Locale} />
      {locale === 'en' && (
        <header className={styles.opening}>
          <div>
            <h1>{t('title')}</h1>
            <p>{t('intro')}</p>
            <a href="#places-form" className={styles.start}>
              {t('formTitle')} <span aria-hidden>↓</span>
            </a>
          </div>
          <figure className={styles.spread}>
            <div>
              {[4, 5].map((page) => (
                <Image
                  key={page}
                  src={`/journey/magazine-pages/all-lebanon-00${page}.webp`}
                  alt={`Beirut, All Lebanon magazine, page ${page}`}
                  width={1057}
                  height={1500}
                  sizes="(min-width: 1051px) 24vw, 1px"
                />
              ))}
            </div>
            <figcaption>
              <em>All Lebanon</em>
              <span>Beirut, pages 4–5</span>
            </figcaption>
          </figure>
        </header>
      )}
      <div
        className={`${styles.workspace} mx-auto grid max-w-6xl gap-8 px-6 py-12 lg:grid-cols-[3fr_2fr]`}
      >
        <section aria-labelledby="places-viewer">
          <h2 id="places-viewer" className="font-display text-ink-900 text-2xl">
            {t('viewerTitle')}
          </h2>
          <div className="border-ink-100 bg-surface-raised text-ink-500 mt-4 flex aspect-[3/4] items-center justify-center border p-6 text-center text-sm">
            {t('viewerSoon')}
          </div>
        </section>
        <section aria-labelledby="places-form">
          <h2 id="places-form" className="font-display text-ink-900 text-2xl">
            {t('formTitle')}
          </h2>
          <PlaceSubmissionForm locale={locale as Locale} />
        </section>
      </div>
    </main>
  )
}
