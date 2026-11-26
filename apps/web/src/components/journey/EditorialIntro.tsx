import { WebsitePhoto } from '../editorial/WebsitePhoto'
import { getTranslations } from 'next-intl/server'
import type { Locale } from '@vardenia/i18n'

export async function EditorialIntro({
  locale,
  kind = 'directory',
  children,
}: {
  children?: import('react').ReactNode
  locale: Locale
  kind?: 'directory' | 'magazine'
}) {
  const t = await getTranslations({ locale, namespace: 'journey' })
  const magazine = kind === 'magazine'
  return (
    <header className="vd-page-intro">
      <div>
        <h1>
          {t(magazine ? 'magazinePageA' : 'directoryTitle')}
          <br />
          {t(magazine ? 'magazinePageB' : 'directoryEmphasis')}
        </h1>
        {magazine ? (
          // The owner's text of 11 November 2026, brought back 16 November: a
          // line under the title, two paragraphs and a closing line in italics.
          // The home page keeps its own shorter magazineA/B/Body.
          <>
            <p className="vd-page-intro-lead">{t('magazinePageLead')}</p>
            {([2, 3] as const).map((n) => (
              <p key={n}>{t(`magazinePageBody${n}`)}</p>
            ))}
            <p>
              <em>{t('magazinePageClosing')}</em>
            </p>
          </>
        ) : (
          <p>{t('directoryBody')}</p>
        )}
        {children}
      </div>
      <WebsitePhoto photo={kind} locale={locale} priority />
    </header>
  )
}
