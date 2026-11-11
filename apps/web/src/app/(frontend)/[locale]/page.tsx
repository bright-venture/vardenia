import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { DEFAULT_LOCALE, isLocale } from '@vardenia/i18n'
import { alternatesFor } from '../../../lib/seo'
import { requireLocale } from '../../../lib/require-locale'
import { BusinessHome } from '../../../components/business-home/BusinessHome'
import { JourneyHome } from '../../../components/home/JourneyHome'

export const revalidate = 3600

/**
 * Which homepage the site shows.
 *
 * 'business' is the designer's Vardenia for Business page, the front page since
 * 11 November 2026, which the owner asked for "for now". 'journey' is the
 * cinematic journey it replaced, kept whole in components/home/JourneyHome.
 * Changing this one word brings it back.
 */
const HOMEPAGE: 'business' | 'journey' = 'business'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale: raw } = await params
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE
  const alternates = alternatesFor('/', locale)
  if (HOMEPAGE === 'journey') return { alternates }
  const t = await getTranslations({ locale, namespace: 'businessHome' })
  return {
    title: { absolute: t('metaTitle') },
    description: t('metaDescription'),
    alternates,
  }
}

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params
  const locale = requireLocale(raw)
  setRequestLocale(locale)
  return HOMEPAGE === 'business' ? (
    <BusinessHome locale={locale} />
  ) : (
    <JourneyHome locale={locale} />
  )
}
