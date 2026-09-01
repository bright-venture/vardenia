import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { isLocale } from '@vardenia/i18n'
import { KeyRound } from 'lucide-react'
import { ForgotPasswordForm } from '../../../../../components/ForgotPasswordForm'
import { AuthCard } from '../../../../../components/auth/AuthCard'

/**
 * Asking for a reset link.
 *
 * Reachable from the sign-in form and from a verification link that has already
 * been used, which is the case that makes it worth having: a customer whose
 * account is fine but who cannot remember getting there.
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

export default async function ForgotPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  setRequestLocale(locale)

  const t = await getTranslations('account')

  return (
    <AuthCard icon={KeyRound} title={t('forgot')} subtitle={t('forgotIntro')}>
      <ForgotPasswordForm />
    </AuthCard>
  )
}
