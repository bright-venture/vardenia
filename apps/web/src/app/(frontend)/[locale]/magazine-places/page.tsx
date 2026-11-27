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

  // The printed spread, on every screen (27 November 2026): in the page header
  // on phones and in other languages, and in the English desktop opening.
  // The pages keep their printed order whatever the reading direction.
  const spread = (
    <figure className={styles.spread}>
      <div dir="ltr">
        {[4, 5].map((page) => (
          <Image
            key={page}
            src={`/journey/magazine-pages/all-lebanon-00${page}.webp`}
            alt={`Beirut, All Lebanon magazine, page ${page}`}
            width={1057}
            height={1500}
            sizes="(min-width: 1051px) 24vw, 50vw"
          />
        ))}
      </div>
      <figcaption>
        <em>All Lebanon</em>
        <span>Beirut, pages 4–5</span>
      </figcaption>
    </figure>
  )

  return (
    <main className={locale === 'en' ? styles.page : undefined}>
      <PageHero title={t('title')} intro={t('intro')} locale={locale as Locale} media={spread} />
      {locale === 'en' && (
        <header className={styles.opening}>
          <div>
            <h1>{t('title')}</h1>
            <p>{t('intro')}</p>
            <a href="#places-form" className={styles.start}>
              {t('formTitle')} <span aria-hidden>↓</span>
            </a>
          </div>
          {spread}
        </header>
      )}
      <div className={`${styles.workspace} mx-auto max-w-6xl px-6 py-12`}>
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
