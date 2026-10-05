import type { ReactNode } from 'react'

/**
 * One stamp on a passport page: a round mark in one of the brand's inks, set at
 * a slight angle as if pressed by hand.
 *
 * The ink follows the section, so a page of stamps reads at a glance as "mostly
 * dinners, two stays". The angle comes from the listing id rather than from
 * `Math.random`, so the page renders the same on the server and the client and
 * a stamp never moves between visits.
 *
 * Three states share the shape:
 *  - `inked`   : earned.
 *  - `pending` : a finished visit inside the week the venue has to mark it.
 *  - `blank`   : an empty space on the page, so the passport has room to fill.
 */

const INK: Record<string, string> = {
  hospitality: 'text-cedar-500 border-cedar-500',
  'food-and-beverage': 'text-gold-500 border-gold-500',
  tourism: 'text-cedar-700 border-cedar-700',
  weddings: 'text-gold-700 border-gold-700',
  lifestyle: 'text-ink-700 border-ink-700',
  healthcare: 'text-cedar-900 border-cedar-900',
  transportation: 'text-ink-500 border-ink-500',
}

const DEFAULT_INK = 'text-cedar-500 border-cedar-500'

/** -9 to 9 degrees, fixed per listing. */
function angleFor(seed: string): number {
  let hash = 0
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) | 0
  return (Math.abs(hash) % 19) - 9
}

export function Stamp({
  state,
  seed = '',
  category,
  top,
  name,
  bottom,
  note,
}: {
  state: 'inked' | 'pending' | 'blank'
  /** Anything stable for the listing; its id. */
  seed?: string
  category?: string | null
  /** Small capitals around the top: the section. */
  top?: ReactNode
  name?: ReactNode
  /** Small capitals at the bottom: the date. */
  bottom?: ReactNode
  /** A line under the stamp, outside the ink. */
  note?: ReactNode
}) {
  const ink = state === 'inked' ? (INK[category ?? ''] ?? DEFAULT_INK) : ''

  return (
    <figure className="flex flex-col items-center gap-3">
      <div
        className={[
          'flex aspect-square w-36 flex-col items-center justify-center rounded-full p-4 text-center sm:w-40',
          state === 'inked' ? `${ink} border-[5px] border-double opacity-90` : '',
          state === 'pending' ? 'border-ink-300 text-ink-500 border-2 border-dashed' : '',
          state === 'blank' ? 'border-ink-300 text-ink-500 border border-dashed' : '',
        ].join(' ')}
        style={state === 'inked' ? { transform: `rotate(${angleFor(seed)}deg)` } : undefined}
      >
        {top ? (
          <span className="text-[0.6rem] font-semibold uppercase leading-tight tracking-[0.2em]">
            {top}
          </span>
        ) : null}
        {name ? (
          <span
            dir="auto"
            className="font-display my-1.5 line-clamp-3 text-base leading-tight sm:text-lg"
          >
            {name}
          </span>
        ) : null}
        {bottom ? (
          <span className="text-[0.6rem] font-semibold uppercase tracking-[0.18em]">{bottom}</span>
        ) : null}
      </div>
      {note ? (
        <figcaption className="text-ink-500 max-w-[11rem] text-center text-xs">{note}</figcaption>
      ) : null}
    </figure>
  )
}
