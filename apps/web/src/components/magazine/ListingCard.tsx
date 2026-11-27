/* eslint-disable @next/next/no-img-element -- a same-origin media path, sized by the page */
import type { PageLayout } from '@vardenia/core/page-layouts'
import { DESCRIPTION_MAX, NAME_MAX, clampStyle, clampText } from '../places/preview-model'
import type { MagazineBusiness } from './types'
import type { MagazineLabels } from './magazine-labels'
import { CARD_GAP, CARD_PADDING, CARD_STYLE } from './card-budget'

const u = (n: number) => `calc(var(--u) * ${n})`

export function ListingCard({
  number,
  layout,
  business,
  highlighted,
  labels,
}: {
  number: number
  layout: PageLayout
  business: MagazineBusiness | undefined
  highlighted: boolean
  labels: MagazineLabels
}) {
  const style = CARD_STYLE[layout]
  const ring = highlighted ? 'outline-gold-500 outline outline-[3px] -outline-offset-2' : ''

  if (!business) {
    return (
      <div
        data-number={number}
        data-free
        className={`bg-ink-100 text-ink-700 relative flex min-h-0 min-w-0 flex-col items-center justify-center gap-1 text-center ${ring}`}
        style={{ fontSize: u(style.body * 1.3) }}
      >
        <strong className="text-ink-900">{labels.listing(number)}</strong>
        <span>{labels.layout(layout)}</span>
        {highlighted ? <YouBadge labels={labels} /> : null}
      </div>
    )
  }

  const description = clampText(business.description, DESCRIPTION_MAX)
  const photo = business.photoUrl ? (
    <img
      src={business.photoUrl}
      alt=""
      loading="lazy"
      className="h-full w-full object-cover"
      data-photo
    />
  ) : (
    <div data-photo-placeholder className="bg-ink-100 h-full w-full" aria-hidden />
  )
  const contact = [business.address, business.phone, business.hours].filter(Boolean)
  const wide = style.kind === 'wide'
  return (
    <article
      data-number={number}
      className={`bg-surface-base text-ink-900 relative flex min-h-0 min-w-0 overflow-hidden ${
        wide ? 'flex-row' : 'flex-col'
      } ${ring}`}
    >
      <div
        className="min-h-0 min-w-0 shrink-0"
        style={wide ? { width: '38%' } : { height: `${style.photo}%` }}
      >
        {photo}
      </div>
      <div
        className="flex min-h-0 min-w-0 flex-1 flex-col"
        style={{ gap: u(CARD_GAP), padding: u(CARD_PADDING), fontSize: u(style.body) }}
      >
        {business.category ? (
          <p
            className="text-ink-500 uppercase tracking-widest"
            style={{ fontSize: u(style.body * 0.8) }}
          >
            {labels.category(business.category)}
          </p>
        ) : null}
        <h3
          className="font-display leading-tight"
          style={{ fontSize: u(style.name), ...clampStyle(2) }}
        >
          {clampText(business.name, NAME_MAX)}
        </h3>
        {description ? (
          <p style={clampStyle(style.lines)} data-description>
            {description}
          </p>
        ) : null}
        {contact.length > 0 ? (
          <p className="text-ink-500 mt-auto" style={clampStyle(2)}>
            {contact.map((part, i) => (
              <span key={i}>
                {i > 0 ? ' · ' : ''}
                {part === business.phone ? <bdi dir="ltr">{part}</bdi> : part}
              </span>
            ))}
          </p>
        ) : null}
      </div>
      {highlighted ? <YouBadge labels={labels} /> : null}
    </article>
  )
}

function YouBadge({ labels }: { labels: MagazineLabels }) {
  return (
    <span
      data-you
      className="bg-gold-500 text-ink-900 absolute end-0 top-0 px-2 py-0.5 font-semibold"
      style={{ fontSize: u(2.2) }}
    >
      {labels.you}
    </span>
  )
}
