import { getLocale, getTranslations } from 'next-intl/server'
import { DEFAULT_LOCALE, isLocale } from '@vardenia/i18n'
import { PageHero } from '../../../components/editorial/PageHero'
import { Link } from '../../../i18n/routing'
/** Covers nested notFound() as well as the independent global document. */
export default async function LocalizedNotFound() {
  const current = await getLocale()
  const locale = isLocale(current) ? current : DEFAULT_LOCALE
  const t = await getTranslations({ locale })
  return (
    <main className="vd-account-gate">
      <PageHero
        title={t('missingPage.title')}
        intro={t('missingPage.body')}
        place={0}
        locale={locale}
      >
        <Link href="/directory" className="vd-button">
          {t('nav.directory')} <span aria-hidden>↗</span>
        </Link>
        <Link href="/magazine" className="vd-text-link">
          {t('nav.magazine')}
        </Link>
      </PageHero>
    </main>
  )
}
