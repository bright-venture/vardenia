import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'
import { isLocale } from '@vardenia/i18n'
import { Link } from '../../../../../i18n/routing'

/**
 * Where an unrecognised QR code lands.
 *
 * A printed code lives in the world for about a year and cannot be recalled, so
 * this page is the last line of defence for the brand: whatever went wrong, the
 * reader must not meet a browser error. It offers a way onward, and it does not
 * blame them for scanning correctly.
 *
 * Deliberately excluded from search engines. It is a fallback, not content.
 */

export const metadata: Metadata = {
  title: 'Code not recognised',
  robots: { index: false, follow: false },
}

export default async function ScanNotFoundPage({
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
  const ar = locale === 'ar'

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-xl flex-col justify-center px-6 py-24">
      <p className="text-gold-700 text-xs uppercase tracking-[0.2em]">
        {ar ? 'فاردينيا' : 'Vardenia'}
      </p>

      <h1 className="font-display text-ink-900 mt-4 text-3xl leading-tight md:text-4xl">
        {ar ? 'لم نتعرف على هذا الرمز' : 'We could not find that code'}
      </h1>

      <p className="text-ink-500 mt-5">
        {ar
          ? 'قد يكون الرمز غير واضح في الطباعة، أو أُدخل بشكل غير صحيح. جرّب المسح مرة أخرى، أو تصفّح الدليل.'
          : 'The code may have scanned imperfectly, or been typed with a character out of place. Try scanning again, or browse the directory instead.'}
      </p>

      {code ? (
        <p className="text-ink-500 mt-4 text-sm">
          {ar ? 'الرمز الذي تلقيناه:' : 'Code received:'}{' '}
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
          {ar ? 'تصفّح الدليل' : 'Browse the directory'}
        </Link>
        <Link
          href="/"
          className="border-ink-100 text-ink-900 hover:border-ink-300 border px-5 py-3 text-sm font-semibold transition-colors"
        >
          {ar ? 'الصفحة الرئيسية' : 'Go to homepage'}
        </Link>
      </div>
    </main>
  )
}
