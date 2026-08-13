'use client'

import { useEffect } from 'react'
import { useLocale } from 'next-intl'
import { Link } from '../../../i18n/routing'

/**
 * Catches anything a public page throws: the database unreachable, a malformed
 * document, a bug.
 *
 * Without this the reader sees Next's default error screen, which in production
 * is a bare "Application error" and in development is a stack trace. Neither is
 * acceptable on a page someone reached by scanning a magazine.
 *
 * `reset()` re-renders the segment. Worth offering because the most likely cause
 * here is a transient database failure - Supabase pausing a free project, or a
 * connection dropped mid-render - and a retry genuinely fixes those.
 *
 * `error.digest` is the id Next assigns server-side and writes to the logs. The
 * message itself is deliberately not shown: it can carry internals, and it means
 * nothing to a reader.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const locale = useLocale()
  const ar = locale === 'ar'

  useEffect(() => {
    // Reaches the browser console and any client-side monitoring. The server
    // side of this is already in the platform logs, keyed by the same digest.
    console.error('Page error', { digest: error.digest, message: error.message })
  }, [error])

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-xl flex-col justify-center px-6 py-24">
      <p className="text-gold-700 text-xs uppercase tracking-[0.2em]">
        {ar ? 'فاردينيا' : 'Vardenia'}
      </p>

      <h1 className="font-display text-ink-900 mt-4 text-3xl leading-tight md:text-4xl">
        {ar ? 'حدث خطأ ما' : 'Something went wrong'}
      </h1>

      <p className="text-ink-500 mt-5">
        {ar
          ? 'المشكلة من جهتنا وليست منك. حاول مرة أخرى بعد لحظات، أو تصفّح الدليل.'
          : 'This is on our side, not yours. Try again in a moment, or browse the directory.'}
      </p>

      <div className="mt-10 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={reset}
          className="bg-ink-900 text-surface-base hover:bg-ink-700 rounded-md px-5 py-3 text-sm font-semibold transition-colors"
        >
          {ar ? 'إعادة المحاولة' : 'Try again'}
        </button>
        <Link
          href="/directory"
          className="border-ink-100 text-ink-900 hover:border-ink-300 rounded-md border px-5 py-3 text-sm font-semibold transition-colors"
        >
          {ar ? 'تصفّح الدليل' : 'Browse the directory'}
        </Link>
      </div>

      {error.digest ? (
        <p className="text-ink-300 mt-8 text-xs">
          {ar ? 'رقم الخطأ:' : 'Reference:'}{' '}
          <code className="text-ink-500" dir="ltr">
            {error.digest}
          </code>
        </p>
      ) : null}
    </main>
  )
}
