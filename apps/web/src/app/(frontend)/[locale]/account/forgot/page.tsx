import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { isLocale } from '@vardenia/i18n'
import { ForgotPasswordForm } from '../../../../../components/ForgotPasswordForm'

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
    <main className="mx-auto max-w-md px-6 py-20">
      <h1 className="font-display text-ink-900 text-3xl">{t('forgot')}</h1>
      <p className="text-ink-500 mt-3 text-sm">{t('forgotIntro')}</p>
      <div className="mt-8">
        <ForgotPasswordForm />
      </div>
    </main>
  )
}
