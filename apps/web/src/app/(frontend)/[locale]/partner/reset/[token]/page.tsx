import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { isLocale } from '@vardenia/i18n'
import { KeyRound } from 'lucide-react'
import { ResetPasswordForm } from '../../../../../../components/ResetPasswordForm'
import { AuthCard } from '../../../../../../components/auth/AuthCard'

/**
 * Where a partner's password link lands - both the invitation sent when staff
 * create the account, and any later reset. From the reader's side those are the
 * same act, so they share this page and the message that leads here.
 *
 * Posts to Payload's own `/api/business-users/reset-password` rather than to
 * `/auth/reset`. That route exists to mark a customer's address verified, which
 * `business-users` has no equivalent of - the account was created by somebody
 * standing in the building.
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

export default async function PartnerResetPage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>
}) {
  const { locale, token } = await params
  if (!isLocale(locale)) notFound()
  setRequestLocale(locale)

  const t = await getTranslations('account')
  const partner = await getTranslations('partner')

  return (
    <AuthCard icon={KeyRound} eyebrow={partner('eyebrow')} title={t('resetTitle')}>
      <ResetPasswordForm
        token={token}
        endpoint="/api/business-users/reset-password"
        signInHref="/partner/login"
      />
    </AuthCard>
  )
}
