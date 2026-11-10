import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'
import { DEFAULT_LOCALE, isLocale, LOCALES, type Locale } from '@vardenia/i18n'
import { alternatesFor } from '../../../../../lib/seo'
import { termsOfService, legalEdition, PLACEHOLDER } from '../../../../../lib/legal'
import { LegalDocumentView } from '../../../../../components/LegalDocument'

/**
 * Terms of Use.
 *
 * Static, like the rest of the public site - the text changes through a deploy,
 * which is the point of keeping it in code. See lib/legal.
 *
 * Deliberately not `noindex`, unlike the account pages. A privacy policy people
 * cannot find is not a privacy policy, and search is how most readers look for
 * one. It inherits the site-wide hold on indexing until that is lifted.
 */

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

/**
 * A function rather than the `metadata` object this used to export.
 *
 * A static object cannot see the locale, so it could not say which URL it was
 * the canonical of, nor that an Arabic version existed. Both editions therefore
 * competed as duplicates. Since 9 November 2026 each language also has its own
 * text (lib/legal-translations), so the title and description follow it too.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const lang = isLocale(locale) ? locale : DEFAULT_LOCALE
  return {
    title: termsOfService(lang).title,
    description: legalEdition(lang).termsDescription,
    alternates: alternatesFor('/legal/terms', lang),
  }
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  setRequestLocale(locale)

  const document = termsOfService(locale)
  const unresolved = document.sections
    .flatMap((section) => section.body)
    .filter((line) => line.includes(PLACEHOLDER)).length

  return (
    <LegalDocumentView
      document={document}
      locale={locale as Locale}
      unresolved={unresolved}
      englishHref="/legal/terms"
    />
  )
}
