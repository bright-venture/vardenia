import { getTranslations } from 'next-intl/server'
import type { Locale } from '@vardenia/i18n'
import { DESTINATIONS } from './destinations'
const photoCredits = [
  [
    'Byblos harbour',
    'https://commons.wikimedia.org/wiki/File:The_harbor_in_the_old_city_of_Byblos,_Lebanon.jpg',
    'Vyacheslav Argenberg · CC BY 4.0',
  ],
  [
    'Bsharri',
    'https://commons.wikimedia.org/wiki/File:Bsharri_(Becharre)_village_as_seen_from_the_slopes_of_Mt_Lebanon,_Bsharri,_Lebanon.jpg',
    'Vyacheslav Argenberg · CC BY 4.0',
  ],
  [
    'Raouché',
    'https://commons.wikimedia.org/wiki/File:Pigeon_Rocks_of_Beirut,_Rock_of_Raouche,_Beirut,_Lebanon.jpg',
    'Vyacheslav Argenberg · CC BY 4.0',
  ],
  [
    'Baalbek',
    'https://commons.wikimedia.org/wiki/File:Lebanon,_Baalbek,_Temple_of_Jupiter.jpg',
    'Vyacheslav Argenberg · CC BY 4.0',
  ],
  [
    'Tyre',
    'https://commons.wikimedia.org/wiki/File:Port,_Tyre,_Lebanon.jpg',
    'Vyacheslav Argenberg · CC BY 4.0',
  ],
  [
    'Deir el Qamar',
    'https://commons.wikimedia.org/wiki/File:Deir_El-Qamar_mosqu%C3%A9e_Fakhreddine.jpg',
    'Patrice Bon · CC0',
  ],
]

export async function PhotographyCredits({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: 'journey' })
  return (
    <div className="vd-credit-content">
      <p>{t('creditIntro')}</p>
      <ul>
        {photoCredits.map(([title, url, credit]) => (
          <li key={url}>
            <a href={url} target="_blank" rel="noopener noreferrer">
              {title}
            </a>{' '}
            · {credit}
          </li>
        ))}
      </ul>
      <p>
        Photographs cropped, resized and colour-graded for display.{' '}
        <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a> ·{' '}
        <a href="https://creativecommons.org/publicdomain/zero/1.0/">CC0</a>.
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
        by Dr Brains, clipped and desaturated ·{' '}
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
