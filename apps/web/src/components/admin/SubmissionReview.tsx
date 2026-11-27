'use client'

import { useEffect, useState } from 'react'
import { useFormFields } from '@payloadcms/ui'
import { reviewRows, type ReviewValues } from '../../lib/submission-review'

/**
 * Everything staff need to review a submitted business, in one place at the top
 * of the Submission tab: owner, reference, page number, layout, when it was
 * submitted, the terms and the price agreed, and the logo and main photo.
 *
 * Display only, read from the form's current values. Nothing is stored here and
 * no payment field is shown. The photos are fetched with the staff member's own
 * session, so the media access rules apply as they do in the media list.
 */

const mediaId = (value: unknown): number | string | null => {
  if (typeof value === 'number' || typeof value === 'string') return value
  const id = (value as { id?: unknown } | null)?.id
  return typeof id === 'number' || typeof id === 'string' ? id : null
}

interface Photo {
  url: string
  alt: string
}

function usePhoto(id: number | string | null): Photo | null {
  // Keyed by the id it was fetched for, so a changed id never shows the old photo.
  const [loaded, setLoaded] = useState<{ id: number | string; photo: Photo | null } | null>(null)
  useEffect(() => {
    if (id === null) return
    let cancelled = false
    fetch(`/api/media/${encodeURIComponent(String(id))}?depth=0`, { credentials: 'same-origin' })
      .then((response) => (response.ok ? response.json() : null))
      .then(
        (doc: { url?: string; alt?: string; sizes?: { thumbnail?: { url?: string } } } | null) => {
          if (cancelled) return
          const url = doc?.sizes?.thumbnail?.url ?? doc?.url
          setLoaded({ id, photo: url ? { url, alt: doc?.alt ?? '' } : null })
        },
      )
      .catch(() => {
        if (!cancelled) setLoaded({ id, photo: null })
      })
    return () => {
      cancelled = true
    }
  }, [id])
  return id !== null && loaded?.id === id ? loaded.photo : null
}

export function SubmissionReview() {
  const values = useFormFields(([fields]): ReviewValues & { hero: unknown; logo: unknown } => ({
    status: fields?.['submission.status']?.value,
    ownerName: fields?.['submission.ownerName']?.value,
    ownerEmail: fields?.['submission.ownerEmail']?.value,
    ownerPhone: fields?.['submission.ownerPhone']?.value,
    submittedAt: fields?.['submission.submittedAt']?.value,
    reference: fields?.['submission.reference']?.value,
    termsVersion: fields?.['submission.terms.version']?.value,
    priceAtAcceptance: fields?.['submission.terms.priceAtAcceptance']?.value,
    currency: fields?.['submission.terms.currency']?.value,
    termMonths: fields?.['submission.terms.termMonths']?.value,
    termsAcceptedAt: fields?.['submission.terms.acceptedAt']?.value,
    rejectionReason: fields?.['submission.rejectionReason']?.value,
    rejectedAt: fields?.['submission.rejectedAt']?.value,
    listingNumber: fields?.listingNumber?.value,
    hero: fields?.heroImage?.value,
    logo: fields?.logo?.value,
  }))
  const hero = usePhoto(mediaId(values.hero))
  const logo = usePhoto(mediaId(values.logo))
  const rows = reviewRows(values)

  return (
    <section style={styles.wrap} aria-label="Submission review">
      <dl style={styles.list}>
        {rows.map(([label, value]) => (
          <div key={label} style={styles.row}>
            <dt style={styles.label}>{label}</dt>
            <dd style={styles.value}>{value}</dd>
          </div>
        ))}
      </dl>
      <div style={styles.photos}>
        <Picture label="Main photo" photo={hero} />
        <Picture label="Logo" photo={logo} />
      </div>
    </section>
  )
}

function Picture({ label, photo }: { label: string; photo: Photo | null }) {
  return (
    <figure style={styles.figure}>
      {photo ? (
        // Plain <img>: a staff-only thumbnail from our own media route.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo.url} alt={photo.alt || label} style={styles.image} />
      ) : (
        <div style={styles.empty}>Not added</div>
      )}
      <figcaption style={styles.caption}>{label}</figcaption>
    </figure>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    border: '1px solid var(--theme-elevation-150)',
    borderRadius: '8px',
    padding: 'var(--base)',
    margin: '0 0 var(--base)',
    background: 'var(--theme-elevation-0)',
  },
  list: { margin: 0, display: 'grid', gap: '0.35rem' },
  row: { display: 'grid', gridTemplateColumns: '9rem 1fr', gap: '0.75rem' },
  label: { color: 'var(--theme-elevation-700)', fontSize: '0.85rem' },
  value: { margin: 0, overflowWrap: 'anywhere' },
  photos: { display: 'flex', flexWrap: 'wrap', gap: 'var(--base)', marginTop: 'var(--base)' },
  figure: { margin: 0 },
  image: {
    display: 'block',
    maxWidth: '14rem',
    maxHeight: '10rem',
    borderRadius: '4px',
    border: '1px solid var(--theme-elevation-150)',
  },
  empty: {
    width: '10rem',
    height: '6rem',
    display: 'grid',
    placeItems: 'center',
    border: '1px dashed var(--theme-elevation-300)',
    borderRadius: '4px',
    color: 'var(--theme-elevation-600)',
    fontSize: '0.85rem',
  },
  caption: { marginTop: '0.25rem', fontSize: '0.8rem', color: 'var(--theme-elevation-700)' },
}
