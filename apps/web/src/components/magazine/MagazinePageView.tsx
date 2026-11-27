import { LAYOUT_SHAPE } from '@vardenia/core/page-layouts'
import type { MagazinePage } from '@vardenia/core/magazine-view'
import { PAGE_RATIO } from '../places/preview-model'
import { EditorialPage } from './EditorialPage'
import { ListingCard } from './ListingCard'
import { CARD_STYLE } from './card-budget'
import type { MagazineLabels } from './magazine-labels'
import type { MagazineBusiness } from './types'

const [RATIO_W, RATIO_H] = PAGE_RATIO.split('/').map((n) => Number(n.trim())) as [number, number]

/**
 * One page (or, for a full spread, two pages wide) of the magazine. The root
 * is the layout container: type and spacing are in `cqw` through `--u`, so the
 * page scales as one piece, whatever width the viewer gives it.
 */
export function MagazinePageView({
  page,
  businesses,
  regionName,
  highlight,
  labels,
  dir,
  imageFor = null,
}: {
  page: MagazinePage
  businesses: Map<number, MagazineBusiness>
  regionName: string | null
  highlight: number | null
  labels: MagazineLabels
  dir: 'ltr' | 'rtl'
  /** The printed page images (an All Lebanon issue), or null to draw the page. */
  imageFor?: ((page: number) => string | null) | null
}) {
  const span = page.kind === 'listings' ? page.span : 1
  const images = imageFor ? Array.from({ length: span }, (_, i) => imageFor(page.page + i)) : []
  if (images.length > 0 && images.every(Boolean)) {
    return (
      <PrintedPage
        page={page}
        span={span}
        images={images as string[]}
        businesses={businesses}
        highlight={highlight}
        labels={labels}
        dir={dir}
      />
    )
  }
  const grid = page.kind === 'listings' ? CARD_STYLE[page.layout] : undefined
  const slotCount = page.kind === 'listings' ? LAYOUT_SHAPE[page.layout].slots : 0
  return (
    <div
      dir={dir}
      data-page={page.page}
      data-span={span}
      style={
        {
          aspectRatio: `${RATIO_W * span} / ${RATIO_H}`,
          containerType: 'inline-size',
          '--u': `${1 / span}cqw`,
        } as React.CSSProperties
      }
      className="bg-surface-base text-ink-900 border-ink-100 font-body relative flex w-full flex-col overflow-hidden border shadow-lg"
    >
      {page.kind === 'editorial' || !grid ? (
        <EditorialPage
          page={page.page}
          note={page.kind === 'editorial' ? page.note : null}
          labels={labels}
        />
      ) : (
        <>
          <div
            className="bg-ink-100 grid min-h-0 flex-1 gap-px"
            style={{
              gridTemplateColumns: `repeat(${grid.columns}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${grid.rows}, minmax(0, 1fr))`,
            }}
          >
            {page.slots.slice(0, slotCount).map((slot) => (
              <ListingCard
                key={slot.number}
                number={slot.number}
                layout={page.layout}
                business={businesses.get(slot.number)}
                highlighted={highlight === slot.number}
                labels={labels}
              />
            ))}
          </div>
          <footer
            dir="ltr"
            data-footer
            className="text-ink-500 flex shrink-0 justify-center tracking-widest"
            style={{ fontSize: 'calc(var(--u) * 2)', padding: 'calc(var(--u) * 1.2)' }}
          >
            {['VARDENIA.COM', String(page.page), regionName ? regionName.toUpperCase() : null]
              .filter(Boolean)
              .join(' | ')}
          </footer>
        </>
      )}
    </div>
  )
}

/**
 * The designer's printed page as it will be printed, with each slot a business
 * has reserved marked over it by name (and the reader's own slot ringed). Free
 * slots show the page as it is. The slot grid is the same as the drawn page's
 * (half page: two rows, 1/3: three, 1/4: two by two), which is how the PDF
 * lays them out, so a mark sits over its listing.
 */
function PrintedPage({
  page,
  span,
  images,
  businesses,
  highlight,
  labels,
  dir,
}: {
  page: MagazinePage
  span: 1 | 2
  images: string[]
  businesses: Map<number, MagazineBusiness>
  highlight: number | null
  labels: MagazineLabels
  dir: 'ltr' | 'rtl'
}) {
  const grid = page.kind === 'listings' ? CARD_STYLE[page.layout] : undefined
  const slots = page.kind === 'listings' ? page.slots.slice(0, LAYOUT_SHAPE[page.layout].slots) : []
  return (
    <div
      dir={dir}
      data-page={page.page}
      data-span={span}
      data-printed
      style={
        {
          aspectRatio: `${RATIO_W * span} / ${RATIO_H}`,
          containerType: 'inline-size',
          '--u': `${1 / span}cqw`,
        } as React.CSSProperties
      }
      className="bg-surface-base border-ink-100 relative flex w-full overflow-hidden border shadow-lg"
    >
      {images.map((src, i) => (
        // Plain img: static files of a fixed size, already compressed; the
        // image optimiser would only re-encode them.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={src}
          src={src}
          alt={labels.page(page.page + i)}
          loading="lazy"
          decoding="async"
          className="h-full min-w-0 flex-1 object-cover"
        />
      ))}
      {grid ? (
        <div
          className="pointer-events-none absolute inset-0 grid"
          style={{
            gridTemplateColumns: `repeat(${grid.columns}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${grid.rows}, minmax(0, 1fr))`,
            padding: 'calc(var(--u) * 4) calc(var(--u) * 4) calc(var(--u) * 7)',
            gap: 'calc(var(--u) * 2)',
          }}
        >
          {slots.map((slot) => {
            const business = businesses.get(slot.number)
            const mine = highlight === slot.number
            return (
              <div
                key={slot.number}
                data-slot={slot.number}
                {...(mine ? { 'data-you': '' } : {})}
                className={`flex items-end justify-start ${mine ? 'outline-gold-500 rounded-sm outline outline-[3px]' : ''}`}
              >
                {business || mine ? (
                  <span
                    className="bg-ink-900/85 text-surface-base font-body max-w-full truncate rounded-sm shadow"
                    style={{
                      fontSize: 'calc(var(--u) * 2.6)',
                      padding: 'calc(var(--u) * 0.8) calc(var(--u) * 1.6)',
                    }}
                  >
                    {mine ? labels.you : business?.name}
                  </span>
                ) : null}
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
