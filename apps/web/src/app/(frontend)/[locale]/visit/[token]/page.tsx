import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { isLocale } from '@vardenia/i18n'
import config from '../../../../../payload.config'
import { Link } from '../../../../../i18n/routing'
import { bookingIdFromToken, visitSummary } from '../../../../../lib/attendance'
import { formatWhen } from '../../../../../lib/booking-email'

/**
 * "Did you go?" - opened from the email a guest gets after a visit.
 *
 * The email's buttons open this page rather than answering, because mail
 * scanners open every link in a message and would otherwise answer for the
 * guest. Here the guest presses once more, and the form posts to
 * /booking/attendance/answer, which comes back with `?done=`.
 *
 * No sign-in: the token in the address is signed for this one booking
 * (lib/attendance) and is the only permission needed.
 */

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Did you go?',
  robots: { index: false, follow: false },
}

const PRIMARY =
  'bg-cedar-900 text-surface-base hover:bg-cedar-700 px-5 py-3 text-sm font-semibold transition-colors'
const SECONDARY =
  'border-ink-100 text-ink-900 hover:border-ink-300 border px-5 py-3 text-sm font-semibold transition-colors'

export default async function VisitPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; token: string }>
  searchParams: Promise<{ answer?: string; done?: string }>
}) {
  const { locale, token } = await params
  if (!isLocale(locale)) notFound()
  setRequestLocale(locale)

  const { answer, done } = await searchParams
  const t = await getTranslations('visit')
  const common = await getTranslations('common')

  const bookingId = bookingIdFromToken(token)
  const payload = await getPayload({ config })
  const visit = bookingId === null ? null : await visitSummary(payload, bookingId, locale)

  const shell = (children: React.ReactNode) => (
    <main className="vd-task-page mx-auto flex min-h-[70vh] max-w-xl flex-col justify-center px-6 py-24">
      <p className="text-gold-700 text-xs uppercase tracking-[0.2em]">{common('brand')}</p>
      {children}
      <div className="mt-10">
        <Link href="/directory" className={SECONDARY}>
          {t('browse')}
        </Link>
      </div>
    </main>
  )

  if (!visit) {
    return shell(
      <h1 className="font-display text-ink-900 mt-4 text-3xl leading-tight">{t('notFound')}</h1>,
    )
  }

  const when = formatWhen(visit.start, locale)

  // Just answered, or answered before: say what is recorded.
  if (done === 'recorded' || visit.answer) {
    const said = visit.answer ?? (done === 'recorded' ? answer : null)
    return shell(
      <>
        <h1 className="font-display text-ink-900 mt-4 text-3xl leading-tight md:text-4xl">
          {said === 'came' ? t('thanksCame') : t('thanksNot')}
        </h1>
        <p className="text-ink-500 mt-5">
          {visit.place} · {when}
        </p>
        {done !== 'recorded' ? <p className="text-ink-500 mt-4 text-sm">{t('already')}</p> : null}
      </>,
    )
  }

  if (!visit.open || done === 'closed') {
    return shell(
      <>
        <h1 className="font-display text-ink-900 mt-4 text-3xl leading-tight">{t('closed')}</h1>
        <p className="text-ink-500 mt-5">
          {visit.place} · {when}
        </p>
      </>,
    )
  }

  const preferred = answer === 'did-not-come' ? 'did-not-come' : answer === 'came' ? 'came' : null

  return shell(
    <>
      <h1 className="font-display text-ink-900 mt-4 text-3xl leading-tight md:text-4xl">
        {t('question', { place: visit.place })}
      </h1>
      <p className="text-ink-500 mt-5">{t('when', { when })}</p>
      {done === 'error' ? <p className="text-ink-700 mt-4 text-sm">{t('error')}</p> : null}

      <form method="post" action="/booking/attendance/answer" className="mt-8 flex flex-wrap gap-3">
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="locale" value={locale} />
        <button
          type="submit"
          name="answer"
          value="came"
          className={preferred === 'did-not-come' ? SECONDARY : PRIMARY}
        >
          {t('yes')}
        </button>
        <button
          type="submit"
          name="answer"
          value="did-not-come"
          className={preferred === 'did-not-come' ? PRIMARY : SECONDARY}
        >
          {t('no')}
        </button>
      </form>
      <p className="text-ink-500 mt-6 text-sm">{t('why')}</p>
    </>,
  )
}
