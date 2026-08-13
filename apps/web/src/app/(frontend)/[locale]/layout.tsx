import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { NextIntlClientProvider } from 'next-intl'
import { setRequestLocale } from 'next-intl/server'
import { dirFor, isLocale, LOCALES, type Locale } from '@vardenia/i18n'
import { SiteHeader } from '../../../components/SiteHeader'
import { SiteFooter } from '../../../components/SiteFooter'
import '../../globals.css'

export const metadata: Metadata = {
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
        <NextIntlClientProvider>
          <SiteHeader locale={locale as Locale} />
          <div className="flex-1">{children}</div>
          <SiteFooter locale={locale as Locale} />
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
