import { publicPageCopy } from '../../../../../lib/public-page-copy'
import { EnglishPageSchema } from '../../../../../components/EnglishPageSchema'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { EVENT_STAFF_SECTION, staffRoleForSlug } from '@vardenia/core'
import { isLocale, type Locale } from '@vardenia/i18n'
import config from '../../../../../payload.config'
import { Link } from '../../../../../i18n/routing'
import { PageHero } from '../../../../../components/editorial/PageHero'
import { StaffRequestForm } from '../../../../../components/StaffRequestForm'
import {
  LINK,
  NOTICE_INFO,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
} from '../../../../../components/formStyles'
import { currentCustomer } from '../../../../../lib/session'
import { buildMetadata } from '../../../../../lib/seo'
import { beirutDate } from '../../../../../lib/beirut'

/**
 * The request form for hostesses or waiters (18 November 2026).
 *
 * Rendered per request, because it reads the session: a guest must be signed
 * in, and the form arrives filled in with their name, email and phone. A
 * signed-out reader is asked to sign in or create an account first.
 */

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ locale: string; role: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, role: slug } = await params
  const role = staffRoleForSlug(slug)
  if (!isLocale(locale) || !role) return {}
  const t = await getTranslations({ locale, namespace: 'eventStaff' })
  return buildMetadata({
    seo: null,
    title: locale === 'en' ? publicPageCopy[`/event-staff/${role.slug}`].title : t('requestTitle', { role: t(`role_${role.slug}`) }),
    description: locale === 'en' ? publicPageCopy[`/event-staff/${role.slug}`].description : t('formIntro'),
    path: `/${EVENT_STAFF_SECTION.path}/${role.slug}`,
    locale,
  })
}

export default async function StaffRequestPage({ params }: Props) {
  const { locale, role: slug } = await params
  const role = staffRoleForSlug(slug)
  if (!isLocale(locale) || !role) notFound()
  setRequestLocale(locale)

  const t = await getTranslations('eventStaff')
  const tb = await getTranslations('booking')
  const roleName = t(`role_${role.slug}`)
  const customer = await currentCustomer()
  const next = `/${EVENT_STAFF_SECTION.path}/${role.slug}`

  let phone = ''
  if (customer) {
    const payload = await getPayload({ config })
    const doc = await payload
      .findByID({ collection: 'customers', id: customer.id, depth: 0, overrideAccess: true })
      .catch(() => null)
    phone = String((doc as { phone?: unknown } | null)?.phone ?? '')
  }

  return (
    <main>
      <EnglishPageSchema locale={locale} path={`/event-staff/${role.slug}`} name={publicPageCopy[`/event-staff/${role.slug}`].title} description={publicPageCopy[`/event-staff/${role.slug}`].description} type="WebPage" />
      <PageHero
        title={t('requestTitle', { role: roleName })}
        intro={t('formIntro')}
        place={4}
        locale={locale as Locale}
      />
      <section className="mx-auto max-w-2xl px-6 py-12">
        <p className="text-sm">
          <Link href={`/${EVENT_STAFF_SECTION.path}`} className={LINK}>
            {t('chooseRole')}
          </Link>
        </p>

        {!customer ? (
          <div className={`${NOTICE_INFO} mt-6`}>
            <p className="font-semibold">{t('signInTitle')}</p>
            <p className="mt-1">{t('signInBody')}</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                href={{ pathname: '/account/signup', query: { next } }}
                className={PRIMARY_BUTTON}
              >
                {tb('accountCreate')}
              </Link>
              <Link
                href={{ pathname: '/account/login', query: { next } }}
                className={SECONDARY_BUTTON}
              >
                {tb('accountSignIn')}
              </Link>
            </div>
          </div>
        ) : !customer.verified ? (
          <p className={`${NOTICE_INFO} mt-6`}>{t('verifyFirst')}</p>
        ) : (
          <StaffRequestForm
            role={role.slug}
            locale={locale as Locale}
            today={beirutDate()}
            account={{ name: customer.name, email: customer.email, phone }}
          />
        )}
      </section>
    </main>
  )
}
