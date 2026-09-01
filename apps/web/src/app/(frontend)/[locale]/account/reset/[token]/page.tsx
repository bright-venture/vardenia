import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { isLocale } from '@vardenia/i18n'
import { KeyRound } from 'lucide-react'
import { ResetPasswordForm } from '../../../../../../components/ResetPasswordForm'
import { AuthCard } from '../../../../../../components/auth/AuthCard'

/**
 * Where a reset link lands.
 *
 * The token is a path segment rather than a query parameter. It has to be in the
 * URL either way, but query strings are the part analytics, proxies and referrer
 * headers capture by habit. Neither placement makes it secret, which is why the
 * token is single-use and expires in an hour.
 *
 * Nothing is checked here. Whether the token is real, unexpired and unused is a
 * database question with one right answer, and asking it twice - once to decide
 * what to render and again when the form submits - means a page that says the
 * link is fine and then refuses it a minute later.
 */

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'account' })
  return { title: t('resetTitle'), robots: { index: false, follow: false } }
}

export default async function ResetPage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>
}) {
  const { locale, token } = await params
  if (!isLocale(locale)) notFound()
  setRequestLocale(locale)

  const t = await getTranslations('account')

  return (
    <AuthCard icon={KeyRound} title={t('resetTitle')}>
      <ResetPasswordForm token={token} />
    </AuthCard>
  )
}
