import { getTranslations } from 'next-intl/server'
import type { Locale } from '@vardenia/i18n'
import { DESTINATIONS } from './destinations'
const photoCredits = [
  [
    'byblos',
    'Byblos harbour',
    'https://commons.wikimedia.org/wiki/File:The_harbor_in_the_old_city_of_Byblos,_Lebanon.jpg',
    'Vyacheslav Argenberg · CC BY 4.0',
  ],
  [
    'bsharri',
    'Bsharri',
    'https://commons.wikimedia.org/wiki/File:Bsharri_(Becharre)_village_as_seen_from_the_slopes_of_Mt_Lebanon,_Bsharri,_Lebanon.jpg',
    'Vyacheslav Argenberg · CC BY 4.0',
  ],
  [
    'beirut',
    'Raouché',
    'https://commons.wikimedia.org/wiki/File:Pigeon_Rocks_of_Beirut,_Rock_of_Raouche,_Beirut,_Lebanon.jpg',
    'Vyacheslav Argenberg · CC BY 4.0',
  ],
  [
    'baalbek',
    'Baalbek',
    'https://commons.wikimedia.org/wiki/File:Lebanon,_Baalbek,_Temple_of_Jupiter.jpg',
    'Vyacheslav Argenberg · CC BY 4.0',
  ],
  [
    'tyre',
    'Tyre',
    'https://commons.wikimedia.org/wiki/File:Port,_Tyre,_Lebanon.jpg',
    'Vyacheslav Argenberg · CC BY 4.0',
  ],
  [
    'broummana',
    'Broummana',
    'https://commons.wikimedia.org/wiki/File:Broumana_From_Hazmieh,_Lebanon.jpg',
    'Paul Saad · CC BY-SA 4.0',
  ],
  // Deir el Qamar's Wikimedia photograph (Patrice Bon, CC0) was replaced on
  // 11 November 2026 with one the team supplied. If that one needs a credit,
  // it goes here.
]

export async function PhotographyCredits({
  locale,
  thumbnails = false,
}: {
  locale: Locale
  thumbnails?: boolean
}) {
  const t = await getTranslations({ locale, namespace: 'journey' })
  return (
    <div className="vd-credit-content">
      <p>{t('creditIntro')}</p>
      <ul>
        {photoCredits.map(([id, title, url, credit]) => {
          const place = DESTINATIONS.find((destination) => destination.id === id)
          return (
            <li key={url}>
              {thumbnails && locale === 'en' && place && (
                <picture hidden className="vd-credit-thumb">
                  <source
                    media="(min-width: 1051px)"
                    srcSet={`/journey/${place.image.replace('.webp', '-m.webp')}`}
                  />
                  <img alt="" width={128} height={90} loading="lazy" />
                </picture>
              )}
              <a href={url} target="_blank" rel="noopener noreferrer">
                {title}
              </a>{' '}
              · {credit}
            </li>
          )
        })}
      </ul>
      <p>
        Photographs cropped, resized and colour-graded for display.{' '}
        <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a> ·{' '}
        <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>.
      </p>
      <p>
        Natural Earth 1:10m · public domain.{' '}
        <a
          href="https://commons.wikimedia.org/wiki/File:Lebanon_topographical_map.png"
          target="_blank"
          rel="noopener noreferrer"
        >
          Lebanon topographical map
        </a>{' '}
        by Dr Brains, adapted for the relief and Barouk area maps ·{' '}
        <a href="https://creativecommons.org/licenses/by-sa/3.0/">CC BY-SA 3.0</a>.{' '}
        <a href="/journey/lebanon-relief-original.png">Original relief image</a>.
      </p>
      <p>
        Photographed paper: <a href="https://texturelabs.org/textures/paper_214/">Paper 214</a> and{' '}
        <a href="https://texturelabs.org/textures/paper_133/">Paper 133</a>, Brady Erickson /
        Texturelabs, under its <a href="https://texturelabs.org/terms/">commercial-use terms</a>.
      </p>
      <ul>
        {DESTINATIONS.map((p) => (
          <li key={p.id}>
            <a href={p.source}>
              {locale === 'ar' ? p.ar : p.name} · {p.lat.toFixed(4)}° N, {p.lon.toFixed(4)}° E
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
