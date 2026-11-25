import { useCallback, type CSSProperties } from 'react'
import artwork from './magazine-page-artwork.json'
import backgrounds from './MagazinePageArtwork.module.css'
import styles from './MagazinePageEditor.module.css'

export const LAYOUTS = [1, 2, 4] as const
export type Layout = (typeof LAYOUTS)[number]
export type Region = keyof typeof artwork
export const REGIONS = Object.keys(artwork) as Region[]
export const DEFAULT_REGION: Record<Layout, Region> = { 1: 'Beirut', 2: 'Matn', 4: 'Beirut' }

type CopyKey = 'category' | 'name' | 'description' | 'callToAction' | 'website'
export type ListingCopy = Record<CopyKey, string> & { photo: File | null }

interface TextPosition {
  at: number[]
  mask?: number[]
  ink?: string
  lines?: number
}

type ContactKey = 'callToAction' | 'website'
type ListingPosition = Record<Exclude<CopyKey, ContactKey>, TextPosition> &
  Partial<Record<ContactKey, TextPosition>> & { photo: number[] }

interface PageArtwork {
  number: number
  paper: string
  folio: TextPosition
  slots: ListingPosition[]
}

const templates: Record<Region, Record<Layout, PageArtwork>> = artwork

export function getMagazineArtwork(layout: Layout, region: Region) {
  return templates[region][layout]
}

export function MagazinePaper({
  template,
  region,
  pageNumber,
  listings,
  onPhotoError,
}: {
  template: PageArtwork
  region: Region
  pageNumber: string
  listings: ListingCopy[]
  onPhotoError: (index: number, file: File) => void
}) {
  return (
    <div
      className={`${styles.paper} ${backgrounds.paper}`}
      style={{ '--paper': template.paper } as CSSProperties}
      data-pdf-page={template.number}
      data-region={region}
      data-listings={template.slots.length}
      role="group"
      aria-label={`${region} magazine page ${pageNumber}`.trim()}
      dir="ltr"
    >
      <LiveField
        field="folio"
        position={template.folio}
        value={pageNumber ? `| ${pageNumber}` : ''}
        show={pageNumber !== String(template.number)}
      />
      {template.slots.map((slot, index) => {
        const listing = listings[index]!
        return (
          <article
            key={index}
            className={styles.slot}
            data-slot={index + 1}
            aria-label={`Listing ${index + 1}`}
          >
            {listing.photo && (
              <div className={styles.frame} style={area(slot.photo)}>
                <PagePhoto
                  file={listing.photo}
                  name={listing.name.trim() || `Listing ${index + 1}`}
                  onError={(file) => onPhotoError(index, file)}
                />
              </div>
            )}
            <LiveField field="category" position={slot.category} value={listing.category} />
            <LiveField field="name" position={slot.name} value={listing.name} />
            <LiveField
              field="description"
              position={slot.description}
              value={listing.description}
            />
            <LiveField
              field="callToAction"
              position={slot.callToAction}
              value={listing.callToAction}
            />
            <LiveField field="website" position={slot.website} value={listing.website} />
          </article>
        )
      })}
    </div>
  )
}

function area([left, top, width, height]: readonly number[]): CSSProperties {
  return {
    left: `${left}%`,
    top: `${top}%`,
    width: `${width}%`,
    ...(height !== undefined && { height: `${height}%` }),
  }
}

function LiveField({
  field,
  position,
  value,
  show = Boolean(value.trim()),
}: {
  field: CopyKey | 'folio'
  position?: TextPosition
  value: string
  show?: boolean
}) {
  if (!position || !show) return null

  return (
    <>
      {position.mask && (
        <span className={styles.mask} style={area(position.mask)} aria-hidden="true" />
      )}
      {value.trim() && (
        <span
          className={styles.liveText}
          data-field={field}
          dir={field === 'website' || field === 'folio' ? 'ltr' : 'auto'}
          style={{
            ...area(position.at),
            color: position.ink,
            WebkitLineClamp: position.lines,
          }}
        >
          {value.trim()}
        </span>
      )}
    </>
  )
}

function PagePhoto({
  file,
  name,
  onError,
}: {
  file: File
  name: string
  onError: (file: File) => void
}) {
  const attach = useCallback(
    (image: HTMLImageElement | null) => {
      if (!image) return
      const url = URL.createObjectURL(file)
      image.src = url
      return () => URL.revokeObjectURL(url)
    },
    [file],
  )

  // Browser-local object URLs cannot be optimized by Next's image loader.
  // eslint-disable-next-line @next/next/no-img-element
  return <img ref={attach} alt={name} onError={() => onError(file)} />
}
