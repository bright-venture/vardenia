import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { isLocale, type Locale } from '@vardenia/i18n'
import { redirect } from '../../../../../i18n/routing'
import { SignupForm } from '../../../../../components/SignupForm'
import { currentCustomer } from '../../../../../lib/session'

/**
 * Create an account.
 *
 * The page is at /account/signup; the endpoint it posts to is at /auth/signup.
 * They cannot share a path - the intl middleware rewrites page paths into the
 * locale tree and would swallow whichever one it was not told to leave alone -
 * and of the two it is the page that deserves the readable URL.
 */

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'account' })
  return { title: t('signUp'), robots: { index: false, follow: false } }
}

export default async function SignupPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  setRequestLocale(locale)

  if (await currentCustomer()) redirect({ href: '/account', locale })

  const t = await getTranslations('account')

  return (
    <main className="mx-auto max-w-md px-6 py-20">
      <h1 className="font-display text-ink-900 text-3xl">{t('signUp')}</h1>
      <div className="mt-8">
        {/* Passed through so the verification email arrives in the language the
            person was reading when they signed up. */}
        <SignupForm locale={locale as Locale} />
      </div>
    </main>
  )
}
