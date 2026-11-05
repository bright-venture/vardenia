import Image from 'next/image'
import { resolveImage, type MediaField } from '../../lib/media'

/** Printed artwork must not use the CMS's cropped 3:4 photographic rendition. */
export function MagazineCover({
  media,
  sizes,
  priority = false,
}: {
  media: MediaField
  sizes: string
  priority?: boolean
}) {
  const original = media && typeof media === 'object' && media.url ? media : null
  const cover = resolveImage(original ? { ...original, sizes: undefined } : media, 'portrait')
  const width = original?.width
  const height = original?.height
  const aspectRatio =
    width && height && Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
      ? `${width} / ${height}`
      : '3 / 4'

  return (
    <div
      className="bg-surface-sunken relative overflow-hidden"
      style={{ aspectRatio }}
      data-magazine-cover
    >
      {cover ? (
        <Image
          src={cover.src}
          alt={cover.alt}
          fill
          priority={priority}
          sizes={sizes}
          className="object-contain"
        />
      ) : null}
    </div>
  )
}
