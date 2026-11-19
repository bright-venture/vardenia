import { InteriorScenicPhoto } from '../editorial/InteriorScenicPhoto'
import { hiddenPages } from '../../lib/hidden-pages'
import { getTranslations } from 'next-intl/server'
import type { Locale } from '@vardenia/i18n'
import { Coordinates } from './Coordinates'
import { DESTINATIONS } from './destinations'

export async function EditorialIntro({
  locale,
  kind = 'directory',
}: {
  locale: Locale
  kind?: 'directory' | 'magazine'
}) {
  const t = await getTranslations({ locale, namespace: 'journey' })
  const magazine = kind === 'magazine',
    place = DESTINATIONS[magazine ? 3 : 0]
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
      </div>
      <InteriorScenicPhoto
        locale={locale}
        place={place}
        directoryShown={
          !magazine || (locale === 'en' && !(await hiddenPages()).includes('directory'))
        }
        image={
          <picture>
            <source
              media="(max-width:700px)"
              srcSet={`/journey/${place.image.replace('.webp', '-m.webp')}`}
            />
            <img
              src={`/journey/${place.image}`}
              alt={place.alt}
              width="1600"
              height="1200"
              fetchPriority="high"
            />
          </picture>
        }
      >
        <Coordinates place={place} enabled label={locale === 'ar' ? place.ar : place.name} />
      </InteriorScenicPhoto>
    </header>
  )
}
