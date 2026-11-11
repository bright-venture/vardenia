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
          {t(magazine ? 'magazineA' : 'directoryTitle')}
          <br />
          {t(magazine ? 'magazineB' : 'directoryEmphasis')}
        </h1>
        <p>{t(magazine ? 'magazineBody' : 'directoryBody')}</p>
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
