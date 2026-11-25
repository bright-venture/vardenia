'use client'

import { useId, useState, type ChangeEvent } from 'react'
import { isAcceptedPhoto, PHOTO_ACCEPT } from '../../places/photos'
import styles from './MagazinePageEditor.module.css'
import {
  DEFAULT_REGION,
  LAYOUTS,
  REGIONS,
  MagazinePaper,
  getMagazineArtwork,
  type Layout,
  type ListingCopy,
  type Region,
} from './MagazinePaper'

const FIELDS = [
  { key: 'category', label: 'Category' },
  { key: 'name', label: 'Listing name' },
  { key: 'description', label: 'Description' },
  { key: 'callToAction', label: 'Call to action' },
  { key: 'website', label: 'Website' },
] as const
type Listing = ListingCopy & { photoError: string }

const EMPTY_LISTING: Listing = {
  category: '',
  name: '',
  description: '',
  callToAction: '',
  website: '',
  photo: null,
  photoError: '',
}

export function MagazinePageEditor() {
  const id = useId()
  const [layout, setLayout] = useState<Layout>(1)
  const [active, setActive] = useState(0)
  const [chosenRegion, setRegion] = useState<Region | null>(null)
  const [chosenPageNumber, setPageNumber] = useState<string | null>(null)
  const [listings, setListings] = useState<Listing[]>(() =>
    Array.from({ length: 4 }, () => ({ ...EMPTY_LISTING })),
  )
  const listing = listings[active]!
  const region = chosenRegion ?? DEFAULT_REGION[layout]
  const template = getMagazineArtwork(layout, region)
  const fields = FIELDS.filter(({ key }) => template.slots[active]?.[key])
  const pageNumber = chosenPageNumber ?? String(template.number)

  function updateListing(index: number, updates: Partial<Listing>) {
    setListings((previous) =>
      previous.map((entry, i) => (i === index ? { ...entry, ...updates } : entry)),
    )
  }

  function selectLayout(next: Layout) {
    setLayout(next)
    setActive((index) => (index < next ? index : 0))
  }

  function selectPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) return
    if (!isAcceptedPhoto(file)) {
      updateListing(active, { photoError: 'Choose a JPEG, PNG or WebP image.' })
      return
    }
    updateListing(active, { photo: file, photoError: '' })
  }

  function reportPhotoError(index: number, file: File) {
    setListings((previous) =>
      previous.map((entry, i) =>
        i === index && entry.photo === file
          ? { ...entry, photo: null, photoError: 'This image could not be displayed.' }
          : entry,
      ),
    )
  }

  return (
    <main className={styles.editor}>
      <header className={styles.header}>
        <p>All Lebanon</p>
        <h1>Magazine page editor</h1>
        <p>Preview changes as you type. Edits and photos stay in this tab until you leave.</p>
      </header>

      <div className={styles.workspace}>
        <div className={styles.controls}>
          <fieldset className={styles.panel}>
            <legend className={styles.legend}>Page settings</legend>
            <fieldset className={styles.layout}>
              <legend>Listings per page</legend>
              <div className={styles.choices}>
                {LAYOUTS.map((count) => (
                  <label key={count} className={styles.choice}>
                    <input
                      type="radio"
                      name={`${id}-layout`}
                      checked={layout === count}
                      onChange={() => selectLayout(count)}
                    />
                    <span>
                      {count} {count === 1 ? 'listing' : 'listings'}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className={styles.pair}>
              <label className={styles.field}>
                Region
                <select
                  value={region}
                  onChange={(event) => setRegion(event.target.value as Region)}
                >
                  {REGIONS.map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                Page number
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={3}
                  value={pageNumber}
                  onChange={(event) => setPageNumber(event.target.value.replace(/\D/g, ''))}
                />
              </label>
            </div>
          </fieldset>

          <fieldset className={styles.panel}>
            <legend className={styles.legend}>Listing details</legend>
            {layout > 1 && (
              <fieldset className={styles.layout}>
                <legend>Edit listing</legend>
                <div className={styles.choices}>
                  {listings.slice(0, layout).map((_, index) => (
                    <label key={index} className={styles.choice}>
                      <input
                        type="radio"
                        name={`${id}-slot`}
                        checked={active === index}
                        onChange={() => setActive(index)}
                      />
                      <span>{index + 1}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            {fields.map(({ key, label }) => (
              <label key={key} className={styles.field}>
                {label}
                {key === 'description' ? (
                  <textarea
                    rows={4}
                    dir="auto"
                    value={listing.description}
                    onChange={(event) => updateListing(active, { description: event.target.value })}
                  />
                ) : (
                  <input
                    type="text"
                    inputMode={key === 'website' ? 'url' : undefined}
                    dir="auto"
                    value={listing[key]}
                    onChange={(event) => updateListing(active, { [key]: event.target.value })}
                  />
                )}
              </label>
            ))}

            <div className={styles.field}>
              <span>Photo</span>
              <label className={styles.photoPicker}>
                <input
                  type="file"
                  accept={PHOTO_ACCEPT}
                  aria-label="Photo"
                  aria-invalid={Boolean(listing.photoError)}
                  aria-describedby={listing.photoError ? `${id}-photo-error` : undefined}
                  onChange={selectPhoto}
                />
                <span>{listing.photo ? 'Replace photo' : 'Choose photo'}</span>
              </label>
              {listing.photo && (
                <div className={styles.photoFile}>
                  <span>{listing.photo.name}</span>
                  <button
                    type="button"
                    onClick={() => updateListing(active, { photo: null, photoError: '' })}
                  >
                    Remove
                  </button>
                </div>
              )}
              {listing.photoError && (
                <p id={`${id}-photo-error`} className={styles.error} role="alert">
                  {listing.photoError}
                </p>
              )}
            </div>
          </fieldset>
        </div>

        <section className={styles.preview} aria-labelledby={`${id}-preview`}>
          <div className={styles.previewHeading}>
            <h2 id={`${id}-preview`}>Live preview</h2>
            <p>PDF page {template.number}. Long text may be shortened to fit.</p>
          </div>
          <div className={styles.board}>
            <MagazinePaper
              template={template}
              region={region}
              pageNumber={pageNumber}
              listings={listings}
              onPhotoError={reportPhotoError}
            />
          </div>
        </section>
      </div>
    </main>
  )
}
