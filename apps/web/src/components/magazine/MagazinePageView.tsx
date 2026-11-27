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
}: {
  page: MagazinePage
  businesses: Map<number, MagazineBusiness>
  regionName: string | null
  highlight: number | null
  labels: MagazineLabels
  dir: 'ltr' | 'rtl'
}) {
  const span = page.kind === 'listings' ? page.span : 1
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
