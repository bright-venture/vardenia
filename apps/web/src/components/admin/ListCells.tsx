'use client'

import type { DefaultCellComponentProps } from 'payload'

/**
 * Cells for the admin lists, where Payload's defaults print the raw value.
 *
 * A tick box printed "true", a fee printed "64", a rating printed "5", and the
 * tier printed its whole explanation, "Silver (magazine page, website
 * included)", on two lines in every row. Each of these says the same thing the
 * way a person reads it. Styles are in app/(payload)/custom.css.
 */

type Props = DefaultCellComponentProps

/** "Silver", plus "Featured" when the listing has a home-page place. */
export function TierCell({ cellData, rowData }: Props) {
  const tier = String(cellData ?? '')
  if (!tier) return null
  const name = tier.charAt(0).toUpperCase() + tier.slice(1)
  return (
    <span className="vd-cell-pills">
      <span className={tier === 'silver' ? 'vd-pill vd-pill--ok' : 'vd-pill'}>{name}</span>
      {(rowData as { featured?: boolean })?.featured ? (
        <span className="vd-pill vd-pill--warn">Featured</span>
      ) : null}
    </span>
  )
}

/** "$64.00". */
export function MoneyCell({ cellData }: Props) {
  if (cellData === null || cellData === undefined || cellData === '') return null
  const amount = Number(cellData)
  if (!Number.isFinite(amount)) return null
  return (
    <span className="vd-num">
      ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    </span>
  )
}

/** A QR code that still works, or one retired from service. */
export function ActiveCell({ cellData }: Props) {
  return cellData === false ? (
    <span className="vd-pill vd-pill--off">Retired</span>
  ) : (
    <span className="vd-pill vd-pill--ok">Active</span>
  )
}

/** An error someone has dealt with, or one still open. */
export function ResolvedCell({ cellData }: Props) {
  return cellData === true ? (
    <span className="vd-pill vd-pill--ok">Fixed</span>
  ) : (
    <span className="vd-pill vd-pill--bad">Open</span>
  )
}

/** "★★★★☆", with the number for a screen reader. */
export function StarsCell({ cellData }: Props) {
  const stars = Math.max(0, Math.min(5, Math.round(Number(cellData) || 0)))
  return (
    <span className="vd-review__stars vd-cell-stars" aria-label={`${stars} out of 5`}>
      {'★'.repeat(stars)}
      <span className="vd-review__stars-off">{'★'.repeat(5 - stars)}</span>
    </span>
  )
}
