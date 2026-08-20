import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { isLocale } from '@vardenia/i18n'
import { ForgotPasswordForm } from '../../../../../components/ForgotPasswordForm'

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
    <main className="mx-auto max-w-md px-6 py-20">
      <p className="text-gold-700 text-xs uppercase tracking-[0.2em]">{partner('eyebrow')}</p>
      <h1 className="font-display text-ink-900 mt-3 text-3xl">{t('forgot')}</h1>
      <p className="text-ink-500 mt-3 text-sm">{t('forgotIntro')}</p>
      <div className="mt-8">
        <ForgotPasswordForm collection="business-users" signInHref="/partner/login" />
      </div>
    </main>
  )
}
