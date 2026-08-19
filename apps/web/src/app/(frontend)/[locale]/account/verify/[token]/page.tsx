import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { isLocale } from '@vardenia/i18n'
import config from '../../../../../../payload.config'
import { Link } from '../../../../../../i18n/routing'
import {
  LINK,
  NOTICE_ERROR,
  NOTICE_SUCCESS,
  PRIMARY_BUTTON,
} from '../../../../../../components/formStyles'

/**
 * The page a verification link lands on.
 *
 * It verifies on render rather than behind a button. A link in an email is a GET
 * and there is no way to make it anything else, so the choice is between doing
 * the work on arrival or showing a "confirm your confirmation" button that
 * exists only to turn the GET into a POST. Every mail client that prefetches
 * links would trip the button anyway.
 *
 * Called through the local API rather than by fetching our own REST endpoint.
 * `payload.verifyEmail` is the same operation the endpoint wraps, minus a round
 * trip and minus the CSRF question a server-side fetch of our own cookie-guarded
 * API would raise.
 */

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'account' })
  return { title: t('verifyTitle'), robots: { index: false, follow: false } }
}

export default async function VerifyPage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>
}) {
  const { locale, token } = await params
  if (!isLocale(locale)) notFound()
  setRequestLocale(locale)

  const t = await getTranslations('account')
  const payload = await getPayload({ config })

  /**
   * A token that has already been used looks exactly like one that was never
   * valid, because verification clears it. So a second click on the same link -
   * ordinary, people do forward these to themselves - lands on the failure
   * message despite having worked the first time.
   *
   * That is why the failure text points at signing in rather than only at asking
   * for a new link: for the commonest cause, the account is already fine.
   */
  const verified = await payload
    .verifyEmail({ collection: 'customers', token })
    .then(() => true)
    .catch(() => false)

  return (
    <main className="mx-auto max-w-md px-6 py-20">
      <h1 className="font-display text-ink-900 text-3xl">{t('verifyTitle')}</h1>

      {verified ? (
        <>
          <p className={`${NOTICE_SUCCESS} mt-6`} role="status">
            {t('verifyDone')}
          </p>
          <Link href="/account/login" className={`${PRIMARY_BUTTON} mt-8`}>
            {t('signIn')}
          </Link>
        </>
      ) : (
        <>
          <p className={`${NOTICE_ERROR} mt-6`} role="alert">
            {t('verifyFailed')}
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link href="/account/login" className={PRIMARY_BUTTON}>
              {t('signIn')}
            </Link>
            <Link href="/account/forgot" className={LINK}>
              {t('forgot')}
            </Link>
          </div>
        </>
      )}
    </main>
  )
}
