import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { isLocale } from '@vardenia/i18n'
import { redirect } from '../../../../../i18n/routing'
import { Store } from 'lucide-react'
import { PartnerLoginForm } from '../../../../../components/PartnerLoginForm'
import { AuthCard } from '../../../../../components/auth/AuthCard'
import { currentOwner } from '../../../../../lib/session'

/**
 * Where a business owner signs in.
 *
 * Not the admin panel, which is bound to the staff collection by `admin.user` -
 * an owner's token is perfectly valid and still cannot open it. That is by
 * construction rather than by a check somebody has to remember, and it is why
 * this page has to exist.
 *
 * Not linked from the site header either. Owners are told the address during
 * onboarding, and a "partner login" link in the main navigation is an invitation
 * to a credential-stuffing script on a page every reader sees.
 */

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'partner' })
  return { title: t('signIn'), robots: { index: false, follow: false } }
}

export default async function PartnerLoginPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  setRequestLocale(locale)

  if (await currentOwner()) redirect({ href: '/partner', locale })

  const t = await getTranslations('partner')

  return (
    /* A different icon and an eyebrow, because the two sign-in screens are
       otherwise identical and a partner who lands on the customer one should be
       able to tell at a glance. */
    <AuthCard
      icon={Store}
      eyebrow={t('eyebrow')}
      title={t('signIn')}
      subtitle={t('signInSubtitle')}
    >
      <PartnerLoginForm />
    </AuthCard>
  )
}
