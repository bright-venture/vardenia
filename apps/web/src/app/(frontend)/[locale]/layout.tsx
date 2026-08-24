import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { NextIntlClientProvider } from 'next-intl'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { dirFor, isLocale, LOCALES, type Locale } from '@vardenia/i18n'
import { getMessages } from '@vardenia/i18n/messages'
import { SiteHeader } from '../../../components/SiteHeader'
import { SiteFooter } from '../../../components/SiteFooter'
import { JsonLd } from '../../../components/JsonLd'
import { isIndexingAllowed } from '../../../lib/indexing'
import { organizationSchema } from '../../../lib/structured-data'
import { FONT_VARIABLES } from '../../fonts'
import '../../globals.css'

/**
 * Site-level metadata, per locale.
 *
 * This was a static `metadata` export, which cannot see the locale - so the
 * Arabic homepage carried the English title and description. That is not
 * cosmetic: the title and description are what a search engine shows in its
 * results, so the Arabic version was competing for Arabic searches with English
 * text. Individual pages already build their own via lib/seo.ts; this is the
 * fallback they inherit from.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'site' })

  return {
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
      default: t('title'),
      template: t('titleTemplate'),
    },
    description: t('description'),

    /**
     * Site-wide noindex until the directory has content. See lib/indexing.
     *
     * Set here so the pages that do not go through `buildMetadata` - the home
     * page, the directory index, the magazine index - are covered too. The four
     * page types that do use `buildMetadata` apply the same rule themselves,
     * because a child's `robots` field replaces this one rather than merging
     * with it.
     */
    robots: isIndexingAllowed() ? undefined : { index: false, follow: false },
  }
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
    // The font variables go on <html> rather than <body> so that anything
    // rendered into a portal or outside the body flow still resolves them.
    <html lang={locale} dir={dirFor(locale)} className={FONT_VARIABLES}>
      {/* The flex column keeps the footer at the bottom on short pages
          (a 404 or an empty directory) instead of floating mid-screen. */}
      <body className="bg-surface-base text-ink-900 flex min-h-screen flex-col antialiased">
        {/* Locale passed explicitly so client components rendered outside a
            page - the error and not-found boundaries - can still read it. */}
        {/* Identifies the publisher once, on every page, so search engines tie
            the site to one entity rather than to unattributed pages. */}
        <JsonLd data={organizationSchema()} />

        {/* Messages passed explicitly. `NextIntlClientProvider` rendered from a
            Server Component inherits the locale, the timezone and `now` from the
            request config, but not the catalogue - checked in the installed
            build, not assumed. Without this every client component calling
            `useTranslations` throws, which is why the forms are the first thing
            in the app to need it.

            Both catalogues together are a couple of kilobytes, so shipping the
            whole thing beats slicing it per route and discovering the missing
            namespace in production. Worth revisiting if they grow. */}
        <NextIntlClientProvider locale={locale} messages={getMessages(locale as Locale)}>
          <SiteHeader locale={locale as Locale} />
          <div className="flex-1">{children}</div>
          <SiteFooter locale={locale as Locale} />
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
