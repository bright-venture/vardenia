import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'
import { DEFAULT_LOCALE, isLocale, LOCALES, type Locale } from '@vardenia/i18n'
import { alternatesFor } from '../../../../../lib/seo'
import { privacyPolicy, PLACEHOLDER } from '../../../../../lib/legal'
import { LegalDocumentView } from '../../../../../components/LegalDocument'

/**
 * Privacy Policy.
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

/** A function rather than a static object, for the reason given on the terms page. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  return {
    title: 'Privacy Policy',
    description: 'How Vardenia handles your information.',
    alternates: alternatesFor('/legal/privacy', isLocale(locale) ? locale : DEFAULT_LOCALE),
  }
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  setRequestLocale(locale)

  const document = privacyPolicy()
  const unresolved = document.sections
    .flatMap((section) => section.body)
    .filter((line) => line.includes(PLACEHOLDER)).length

  return <LegalDocumentView document={document} locale={locale as Locale} unresolved={unresolved} />
}
