import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { isLocale } from '@vardenia/i18n'
import { PlacePhotoUpload } from '../../../../../components/places/PlacePhotoUpload'

/**
 * The phone page behind the QR code of the Magazine Places form: the owner
 * sends the logo and the main photo from here (step 2). PLACEHOLDER layout,
 * a teammate restyles it.
 *
 * The session token is in the URL fragment, which the server never sees; the
 * client component reads it and removes it from the address bar. This page is
 * for whoever holds the link: not in the sitemap, not indexed, and it sends no
 * referrer. It is per request, never cached.
 */

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ locale: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  const t = await getTranslations({ locale, namespace: 'magazinePlaces.upload' })
  return { title: t('title'), robots: { index: false, follow: false }, referrer: 'no-referrer' }
}

export default async function MagazinePlacesUploadPage({ params }: Props) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  setRequestLocale(locale)
  const t = await getTranslations('magazinePlaces.upload')

  return (
    <main className="mx-auto max-w-md px-6 py-10">
      <h1 className="font-display text-ink-900 text-3xl">{t('title')}</h1>
      <div className="mt-6">
        <PlacePhotoUpload />
      </div>
    </main>
  )
}
