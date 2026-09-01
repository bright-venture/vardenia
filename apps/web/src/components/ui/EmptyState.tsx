import type { ReactNode } from 'react'

/**
 * What a page says when there is nothing to show.
 *
 * # Why this is a component and not a paragraph
 *
 * An empty result is the moment a reader is most likely to leave, and the
 * difference between "No results" and a sentence telling them which filter to
 * drop is most of the recovery. Making it a component means every page gets the
 * useful version rather than whichever one its author felt like writing.
 *
 * # The rules it enforces
 *
 * The title says what happened, in a full sentence. The body says what to do
 * next. Neither apologises, and neither blames the reader for searching for
 * something we do not have yet - on a directory this young, an empty result is
 * usually our gap and not their mistake.
 *
 * `role="status"` because on a filtered page this appears without a navigation,
 * so a screen reader would otherwise be told nothing at all when the results
 * vanish.
 */
export function EmptyState({
  title,
  body,
  action,
}: {
  title: ReactNode
  body?: ReactNode
  action?: ReactNode
}) {
  return (
    <div
      role="status"
      className="border-ink-100 col-span-full flex flex-col items-center gap-3 border border-dashed px-6 py-16 text-center"
    >
      <h3 className="text-ink-900 text-xl">{title}</h3>
      {body ? <p className="text-ink-500 max-w-[46ch] text-sm leading-relaxed">{body}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  )
}
