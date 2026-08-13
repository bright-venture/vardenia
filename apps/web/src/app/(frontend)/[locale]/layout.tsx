import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { NextIntlClientProvider } from 'next-intl'
import { setRequestLocale } from 'next-intl/server'
import { dirFor, isLocale, LOCALES, type Locale } from '@vardenia/i18n'
import { SiteHeader } from '../../../components/SiteHeader'
import { SiteFooter } from '../../../components/SiteFooter'
import { JsonLd } from '../../../components/JsonLd'
import { organizationSchema } from '../../../lib/structured-data'
import '../../globals.css'

export const metadata: Metadata = {
  /**
   * Absolute base for every relative URL in metadata.
   *
   * Without it Next emits canonical and hreflang as paths. Browsers resolve
   * those fine, but Google's hreflang spec requires fully-qualified URLs and
   * ignores relative ones - which would silently undo the whole point of
   * declaring the English and Arabic versions as translations.
   *
   * Falls back to localhost so a developer build does not crash; production
   * must have NEXT_PUBLIC_SITE_URL set, which is already true because the QR
   * codes depend on it.
   */
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: {
    default: 'Vardenia - Discover Lebanon',
    template: '%s - Vardenia',
  },
  description:
    "Lebanon's premium tourism and lifestyle guide: hotels, restaurants, experiences and hidden villages, curated and verified.",
}

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export default async function FrontendLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()

  // Required for static rendering of localized routes.
  setRequestLocale(locale)

  return (
    <html lang={locale} dir={dirFor(locale)}>
      {/* The flex column keeps the footer at the bottom on short pages
          (a 404 or an empty directory) instead of floating mid-screen. */}
      <body className="bg-surface-base text-ink-900 flex min-h-screen flex-col antialiased">
        {/* Locale passed explicitly so client components rendered outside a
            page - the error and not-found boundaries - can still read it. */}
        {/* Identifies the publisher once, on every page, so search engines tie
            the site to one entity rather than to unattributed pages. */}
        <JsonLd data={organizationSchema()} />

        <NextIntlClientProvider locale={locale}>
          <SiteHeader locale={locale as Locale} />
          <div className="flex-1">{children}</div>
          <SiteFooter locale={locale as Locale} />
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
