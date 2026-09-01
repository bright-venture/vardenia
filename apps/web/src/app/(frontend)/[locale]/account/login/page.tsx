import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { isLocale } from '@vardenia/i18n'
import { redirect } from '../../../../../i18n/routing'
import { LogIn } from 'lucide-react'
import { LoginForm } from '../../../../../components/LoginForm'
import { AuthCard } from '../../../../../components/auth/AuthCard'
import { currentCustomer } from '../../../../../lib/session'

/**
 * Sign in.
 *
 * Dynamic and noindex for the same reasons as the account page: it reads the
 * session, and a sign-in form is not a search result.
 *
 * `?next=` is honoured so a reader sent here from somewhere else lands back
 * where they were. What counts as an acceptable destination is decided by
 * lib/safe-next, applied in the form - an open redirect on a sign-in page is the
 * classic way to make a phishing link look like it came from us, since the
 * domain in the address bar is genuinely ours right up until the redirect fires.
 *
 * This comment used to say "paths beginning with a single slash", which is what
 * the guard was meant to do and not what it did. See lib/safe-next.
 */

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'account' })
  return { title: t('signIn'), robots: { index: false, follow: false } }
}

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ next?: string }>
}) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  setRequestLocale(locale)

  // Already signed in: showing the form again would invite somebody to type
  // their password for no reason. next-intl's redirect rather than Next's, so
  // an Arabic reader lands on /ar/account instead of being thrown to English.
  if (await currentCustomer()) redirect({ href: '/account', locale })

  const { next } = await searchParams
  const t = await getTranslations('account')

  return (
    <AuthCard icon={LogIn} title={t('signIn')} subtitle={t('signInSubtitle')}>
      <LoginForm next={next} />
    </AuthCard>
  )
}
