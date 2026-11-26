import { cache } from 'react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { isLocale, type Locale } from '@vardenia/i18n'
import config from '../../../../../payload.config'
import { BrandPageView } from '../../../../../components/brand/BrandPageView'
import { publicBrand } from '../../../../../lib/brands'
import { buildMetadata } from '../../../../../lib/seo'

/**
 * A restaurant brand and its branches, at /brands/<slug> (Task 12).
 *
 * Reads the same function GET /brand-data/<slug> serves (lib/brands
 * publicBrand: public reads only, a brand with no published branch is
 * unknown), directly rather than through a request to ourselves. 404 for an
 * unknown slug, exactly as the endpoint does.
 *
 * Rendered per request, like the endpoint is `no-store`: a branch that is
 * unpublished must disappear from this page at once, and the answer depends on
 * the locale.
 */
export const dynamic = 'force-dynamic'

interface Params {
  params: Promise<{ locale: string; slug: string }>
}

// Per request only, so generateMetadata and the page share one set of reads.
const load = cache(async (slug: string, locale: Locale) => {
  const payload = await getPayload({ config })
  return publicBrand(payload, slug, locale)
})

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale, slug } = await params
  if (!isLocale(locale)) return {}
  const brand = await load(slug, locale)
  if (!brand) return {}
  const t = await getTranslations({ locale, namespace: 'brandPage' })
  return buildMetadata({
    seo: undefined,
    title: brand.name,
    description: brand.description ?? t('description', { name: brand.name }),
    path: `/brands/${slug}`,
    locale,
  })
}

export default async function BrandPage({ params }: Params) {
  const { locale, slug } = await params
  if (!isLocale(locale)) notFound()
  setRequestLocale(locale)

  const brand = await load(slug, locale)
  if (!brand) notFound()

  return <BrandPageView brand={brand} locale={locale} />
}
