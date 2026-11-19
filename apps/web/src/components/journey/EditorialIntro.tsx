import { Caveat } from 'next/font/google'
import { getTranslations } from 'next-intl/server'
import type { Locale } from '@vardenia/i18n'
import { Coordinates } from './Coordinates'
import { DESTINATIONS } from './destinations'
const captionFont = Caveat({ weight: '500', subsets: ['latin'], display: 'swap', preload: false, variable: '--font-pinned-caption' })

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
      <figure className={locale === 'en' ? captionFont.variable : undefined}>
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
