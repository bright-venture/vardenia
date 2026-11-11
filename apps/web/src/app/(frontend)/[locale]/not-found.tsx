import { getLocale, getTranslations } from 'next-intl/server'
import { DEFAULT_LOCALE, isLocale } from '@vardenia/i18n'
import { PageHero } from '../../../components/editorial/PageHero'
import { Link } from '../../../i18n/routing'
import { hiddenPages } from '../../../lib/hidden-pages'
/** Covers nested notFound() as well as the independent global document. */
export default async function LocalizedNotFound() {
  const current = await getLocale()
  const locale = isLocale(current) ? current : DEFAULT_LOCALE
  const t = await getTranslations({ locale })
  const hidden = await hiddenPages()
  return (
    <main className="vd-account-gate">
      <PageHero
        title={t('missingPage.title')}
        intro={t('missingPage.body')}
        place={0}
        locale={locale}
      >
        {/* The ways out, but never to a page the admin has hidden: the home
            page when both are. */}
        {hidden.includes('directory') ? (
          <Link href="/" className="vd-button">
            {t('common.homepage')} <span aria-hidden>↗</span>
          </Link>
        ) : (
          <Link href="/directory" className="vd-button">
            {t('nav.directory')} <span aria-hidden>↗</span>
          </Link>
        )}
        {hidden.includes('magazine') ? null : (
          <Link href="/magazine" className="vd-text-link">
            {t('nav.magazine')}
          </Link>
        )}
      </PageHero>
    </main>
  )
}
