import Image from 'next/image'
import { getTranslations } from 'next-intl/server'
import type { Locale } from '@vardenia/i18n'
import { MAGAZINE_PHOTO } from '../../lib/section-photos'
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
    place = DESTINATIONS[0]
  return (
    <header className="vd-page-intro">
      <div>
        <h1>
          {t(magazine ? 'magazinePageA' : 'directoryTitle')}
          <br />
          {t(magazine ? 'magazinePageB' : 'directoryEmphasis')}
        </h1>
        {magazine ? (
          // The owner's text of 11 November 2026: a line under the title, four
          // paragraphs and a closing line in italics. The journey homepage keeps
          // its own shorter magazineA/B/Body.
          <>
            <p className="vd-page-intro-lead">{t('magazinePageLead')}</p>
            {([1, 2, 3, 4] as const).map((n) => (
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
      {magazine ? (
        // The magazine itself, not a place: no coordinates.
        <figure className="vd-page-intro-portrait">
          <Image
            src={MAGAZINE_PHOTO.src}
            alt={MAGAZINE_PHOTO.alt}
            width={MAGAZINE_PHOTO.width}
            height={MAGAZINE_PHOTO.height}
            sizes="(max-width:700px) 100vw, 440px"
            priority
          />
        </figure>
      ) : (
        <figure>
          <img src={`/journey/${place.image}`} alt={place.alt} width="1600" height="1200" />
          <Coordinates place={place} enabled label={locale === 'ar' ? place.ar : place.name} />
        </figure>
      )}
    </header>
  )
}
