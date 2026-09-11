import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { isLocale } from '@vardenia/i18n'
import { Link } from '../../../../../i18n/routing'

/**
 * Where a deactivated code lands.
 *
 * Distinct from `not-found` on purpose. This code was real and is now retired,
 * usually because the business closed or the placement expired. The reader
 * scanned correctly, so the copy says so, and the page still gives them
 * somewhere useful to go rather than treating it as an error.
 */

export const metadata: Metadata = {
  title: 'This listing has moved',
  robots: { index: false, follow: false },
}

export default async function ScanMovedPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ code?: string }>
}) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  setRequestLocale(locale)

  const { code } = await searchParams
  const t = await getTranslations()

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-xl flex-col justify-center px-6 py-24">
      <p className="text-gold-700 text-xs uppercase tracking-[0.2em]">{t('common.brand')}</p>

      <h1 className="font-display text-ink-900 mt-4 text-3xl leading-tight md:text-4xl">
        {t('scan.moved')}
      </h1>

      <p className="text-ink-500 mt-5">{t('scan.movedBody')}</p>

      {code ? (
        <p className="text-ink-500 mt-4 text-sm">
          {t('scan.code')}{' '}
          <code className="text-ink-700" dir="ltr">
            {code}
          </code>
        </p>
      ) : null}

      <div className="mt-10 flex flex-wrap gap-3">
        <Link
          href="/directory"
          className="bg-cedar-900 text-surface-base hover:bg-cedar-700 px-5 py-3 text-sm font-semibold transition-colors"
        >
          {t('scan.browse')}
        </Link>
        <Link
          href="/"
          className="border-ink-100 text-ink-900 hover:border-ink-300 border px-5 py-3 text-sm font-semibold transition-colors"
        >
          {t('scan.homepage')}
        </Link>
      </div>
    </main>
  )
}
