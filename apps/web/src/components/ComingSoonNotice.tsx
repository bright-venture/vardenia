import { getTranslations } from 'next-intl/server'
import { Link } from '../i18n/routing'
import { EmptyState } from './ui/EmptyState'
import { LinkArrow } from './LinkArrow'

/**
 * What a section that is not open yet shows instead of its listings or its form
 * (25 November 2026): Weddings, Getting Around and Event Staff, see core
 * COMING_SOON_CATEGORIES and EVENT_STAFF_COMING_SOON. The way on is the
 * directory, where the open sections are.
 */
export async function ComingSoonNotice({ body }: { body: 'sectionBody' | 'eventStaffBody' }) {
  const t = await getTranslations('comingSoon')
  return (
    <section className="mx-auto max-w-4xl px-6 py-12">
      <EmptyState
        title={
          <>
            <span className="text-gold-700 mb-2 block text-xs uppercase tracking-[0.2em]">
              {t('label')}
            </span>
            {t('title')}
          </>
        }
        body={t(body)}
        action={
          <Link href="/directory" className="vd-button">
            {t('explore')}
            <LinkArrow />
          </Link>
        }
      />
    </section>
  )
}
