import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { isLocale } from '@vardenia/i18n'
import { KeyRound } from 'lucide-react'
import { ForgotPasswordForm } from '../../../../../components/ForgotPasswordForm'
import { AuthCard } from '../../../../../components/auth/AuthCard'

/**
 * A partner who cannot get in.
 *
 * Posts to `/api/business-users/forgot-password`, which fails silently for an
 * address with no account - Payload's own comment is that saying otherwise
 * "could lead to the exposure of registered emails". Here that would also
 * disclose who we work with, which is commercial information rather than merely
 * personal.
 */

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'account' })
  return { title: t('forgot'), robots: { index: false, follow: false } }
}

export default async function PartnerForgotPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  setRequestLocale(locale)

  const t = await getTranslations('account')
  const partner = await getTranslations('partner')

  return (
    <AuthCard
      icon={KeyRound}
      eyebrow={partner('eyebrow')}
      title={t('forgot')}
      subtitle={t('forgotIntro')}
    >
      <ForgotPasswordForm collection="business-users" signInHref="/partner/login" />
    </AuthCard>
  )
}
