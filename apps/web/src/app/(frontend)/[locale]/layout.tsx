import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { NextIntlClientProvider } from 'next-intl'
import { setRequestLocale } from 'next-intl/server'
import { dirFor, isLocale, LOCALES } from '@vardenia/i18n'
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
      <body className="bg-surface-base text-ink-900 antialiased">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  )
}
