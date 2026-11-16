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
          {t(magazine ? 'magazineA' : 'directoryTitle')}
          <br />
          {t(magazine ? 'magazineB' : 'directoryEmphasis')}
        </h1>
        <p>{t(magazine ? 'magazineBody' : 'directoryBody')}</p>
      </div>
      <figure>
        {/*
          The phone crop below 700px, as on the home page (CinematicJourney):
          the 640px file is about a fifth of the 1600px one. This photograph is
          the largest thing on the first screen of the directory and the
          magazine, and sending the full file to a phone held it back to 4.4
          and 4.1 seconds on slow 4G (measured 16 November 2026).
        */}
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
        <Coordinates place={place} enabled label={locale === 'ar' ? place.ar : place.name} />
      </figure>
    </header>
  )
}
