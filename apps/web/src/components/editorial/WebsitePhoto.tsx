import Image from 'next/image'
import { getTranslations } from 'next-intl/server'
import type { Locale } from '@vardenia/i18n'
import { hiddenPages } from '../../lib/hidden-pages'
import { InteriorScenicPhoto } from './InteriorScenicPhoto'

export const websitePhotos = {
  stay: { file: 'stay-pool.webp', width: 1600, height: 900 },
  'eat-and-drink': { file: 'dining-courtyard.webp', width: 712, height: 401 },
  weddings: { file: 'wedding-garden.webp', width: 980, height: 552 },
  lifestyle: { file: 'lifestyle-shopping.webp', width: 1600, height: 901 },
  'getting-around': { file: 'driving-road.webp', width: 809, height: 540 },
  'event-staff': { file: 'event-team.webp', width: 873, height: 582 },
  directory: { file: 'bhamdoun.webp', width: 1078, height: 460, where: 'aley' },
  magazine: { file: 'falougha.webp', width: 600, height: 480, where: 'matn' },
  issues: { file: 'barouk-cedars.webp', width: 887, height: 591, where: 'barouk' },
  about: { file: 'beiteddine.webp', width: 791, height: 527, where: 'beiteddine' },
  more: { file: 'sawfar.webp', width: 758, height: 505, where: 'aley' },
  faq: { file: 'laqlouq.webp', width: 869, height: 670, where: 'jbeil' },
  'add-your-business': { file: 'ehden.webp', width: 1008, height: 672, where: 'zgharta' },
} as const
export type WebsitePhotoKey = keyof typeof websitePhotos

export async function WebsitePhoto({
  photo,
  locale,
  className,
  priority = false,
  pinOnRight = true,
}: {
  photo: WebsitePhotoKey
  locale: Locale
  className?: string
  priority?: boolean
  pinOnRight?: boolean
}) {
  const t = await getTranslations({ locale, namespace: 'websitePhotos' })
  const label = t(photo)
  const asset = websitePhotos[photo]
  const area = 'where' in asset ? { where: asset.where } : {}
  const directoryShown =
    locale === 'en' && 'where' in asset && !(await hiddenPages()).includes('directory')
  return (
    <InteriorScenicPhoto
      locale={locale}
      place={{ id: photo, name: label, ar: label, image: asset.file, alt: label, ...area }}
      className={className}
      directoryShown={directoryShown}
      pinOnRight={pinOnRight}
      image={
        <Image
          src={`/journey/${asset.file}`}
          alt={label}
          width={asset.width}
          height={asset.height}
          sizes="(max-width:700px) 100vw, 60vw"
          priority={priority}
        />
      }
    >
      <figcaption className="vd-coordinates">{label}</figcaption>
    </InteriorScenicPhoto>
  )
}
