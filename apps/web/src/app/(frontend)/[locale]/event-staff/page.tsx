import { publicPageCopy } from '../../../../lib/public-page-copy'
import { EnglishPageSchema } from '../../../../components/EnglishPageSchema'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { EVENT_STAFF_COMING_SOON, EVENT_STAFF_ROLES, EVENT_STAFF_SECTION } from '@vardenia/core'
import { isLocale, type Locale } from '@vardenia/i18n'
import { Link } from '../../../../i18n/routing'
import { PageHero } from '../../../../components/editorial/PageHero'
import { ComingSoonNotice, DesktopOpeningNotice } from '../../../../components/ComingSoonNotice'
import { buildMetadata } from '../../../../lib/seo'
import { sectionName, sectionSummary } from '../../../../lib/labels'

/**
 * Event Staff, the seventh section (18 November 2026): two choices,
 * Hostesses and Waiters, each opening a request form. No listings.
 */

interface Props {
  params: Promise<{ locale: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  return buildMetadata({
    seo: null,
    title:
      locale === 'en'
        ? publicPageCopy['/event-staff'].title
        : sectionName(EVENT_STAFF_SECTION, locale),
    description:
      locale === 'en'
        ? publicPageCopy['/event-staff'].description
        : sectionSummary(EVENT_STAFF_SECTION, locale),
    path: `/${EVENT_STAFF_SECTION.path}`,
    locale,
  })
}

export default async function EventStaffPage({ params }: Props) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  setRequestLocale(locale)
  const t = await getTranslations('eventStaff')

  return (
    <main data-staff-opening={EVENT_STAFF_COMING_SOON || undefined}>
      <EnglishPageSchema
        locale={locale}
        path={'/event-staff'}
        name={publicPageCopy['/event-staff'].title}
        description={publicPageCopy['/event-staff'].description}
        type="CollectionPage"
      />
      <PageHero
        title={sectionName(EVENT_STAFF_SECTION, locale as Locale)}
        intro={t('intro')}
        photo="event-staff"
        locale={locale as Locale}
      >
        {EVENT_STAFF_COMING_SOON && locale === 'en' && (
          <DesktopOpeningNotice body="eventStaffBody" />
        )}
      </PageHero>
      {/* Coming soon (25 November 2026): no request forms until it opens. */}
      {EVENT_STAFF_COMING_SOON ? (
        <ComingSoonNotice body="eventStaffBody" />
      ) : (
        <section className="mx-auto max-w-4xl px-6 py-12">
          <h2 className="font-display text-ink-900 text-2xl">{t('chooseRole')}</h2>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2">
            {EVENT_STAFF_ROLES.map((role) => (
              <li key={role.slug}>
                <Link
                  href={`/${EVENT_STAFF_SECTION.path}/${role.slug}`}
                  className="border-ink-100 hover:border-ink-300 bg-surface-raised block border p-6 transition-colors"
                >
                  <span className="font-display text-ink-900 block text-2xl">
                    {t(`role_${role.slug}`)}
                  </span>
                  <span className="text-ink-700 mt-2 block text-sm">
                    {role.slug === 'waiters' ? t('waitersBody') : t('hostessesBody')}
                  </span>
                  <span className="text-gold-700 mt-4 inline-block text-sm underline underline-offset-4">
                    {t('requestTitle', { role: t(`role_${role.slug}`) })}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  )
}
