'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useDocumentInfo } from '@payloadcms/ui'

/**
 * Everything attached to one listing, from inside the listing.
 *
 * Bookings, reviews, fee statements, closed dates and QR codes each live in
 * their own list, which is right for working through them and wrong for the
 * question staff actually ask on the phone: "what is going on with this
 * place?". This answers it from the listing itself: how many of each there
 * are, and a link that opens that list showing only this listing's.
 *
 * Counts come from the REST API with the staff member's own session, one
 * request each for a single row, so access rules apply exactly as they do in
 * the lists. Nothing here is stored, and nothing runs on the public site.
 */

interface Kind {
  collection: string
  label: string
  hint: string
}

const KINDS: Kind[] = [
  { collection: 'bookings', label: 'Bookings', hint: 'Every request for this place' },
  { collection: 'reviews', label: 'Reviews', hint: 'What guests wrote' },
  { collection: 'statements', label: 'Fee statements', hint: 'Monthly invoices' },
  { collection: 'closures', label: 'Closed dates', hint: 'When it is shut' },
  { collection: 'qr-codes', label: 'QR codes', hint: 'Its printed codes' },
]

const listHref = (collection: string, id: string | number) =>
  `/admin/collections/${collection}?where[business][equals]=${encodeURIComponent(String(id))}`

export function ListingActivity() {
  const { id } = useDocumentInfo()
  const [counts, setCounts] = useState<Record<string, number | null>>({})

  useEffect(() => {
    if (id === undefined || id === null) return
    let cancelled = false

    for (const kind of KINDS) {
      fetch(
        `/api/${kind.collection}?where[business][equals]=${encodeURIComponent(String(id))}&limit=1&depth=0`,
        { credentials: 'same-origin' },
      )
        .then((response) => (response.ok ? response.json() : null))
        .then((body: { totalDocs?: number } | null) => {
          if (cancelled) return
          setCounts((current) => ({ ...current, [kind.collection]: body?.totalDocs ?? null }))
        })
        .catch(() => {
          if (!cancelled) setCounts((current) => ({ ...current, [kind.collection]: null }))
        })
    }

    return () => {
      cancelled = true
    }
  }, [id])

  if (id === undefined || id === null) {
    return <p style={styles.muted}>Save the listing first. Its bookings and reviews appear here.</p>
  }

  return (
    <div style={styles.wrap}>
      <p style={styles.muted}>
        Everything attached to this listing. Each link opens only its items.
      </p>
      <div style={styles.grid}>
        {KINDS.map((kind) => {
          const count = counts[kind.collection]
          return (
            <Link key={kind.collection} href={listHref(kind.collection, id)} style={styles.card}>
              <span style={styles.count}>{count === undefined ? '…' : (count ?? '?')}</span>
              <span style={styles.label}>{kind.label}</span>
              <span style={styles.muted}>{kind.hint}</span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--base)',
    marginBottom: 'var(--base)',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
    gap: 'var(--base)',
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.2rem',
    border: '1px solid var(--theme-elevation-150)',
    borderRadius: '8px',
    padding: 'var(--base)',
    textDecoration: 'none',
    color: 'inherit',
    background: 'var(--theme-elevation-0)',
  },
  count: {
    fontSize: '1.6rem',
    fontWeight: 600,
    lineHeight: 1.1,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--theme-elevation-900)',
  },
  label: { fontWeight: 600, color: 'var(--theme-elevation-900)' },
  muted: { margin: 0, fontSize: '0.8125rem', color: 'var(--theme-elevation-600)' },
}

export default ListingActivity
