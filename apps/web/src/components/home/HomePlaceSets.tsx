'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, Pause, Play } from 'lucide-react'
import { HOME_PLACES_LIMIT } from '../../lib/home-selection'
import { useEnglishHomeEdition } from '../editorial/useDesktopEdition'
import { useJourneyMotion } from '../journey/browser-state'
import { useVisibleRotation } from '../journey/useCityAutoplay'

const HOME_PLACES_GRID = 'grid grid-cols-1 gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3'
const HOME_PLACES_DELAY = 8000
const FLIP_FALLBACK_DELAY = 920

export function HomePlaceSets({
  cards,
}: {
  cards: { key: string | number; content: ReactNode }[]
}) {
  const root = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)
  const [incoming, setIncoming] = useState<number | null>(null)
  const [paused, setPaused] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [motion] = useJourneyMotion()
  const showSets = useEnglishHomeEdition('en')
  const setCount = Math.ceil(cards.length / HOME_PLACES_LIMIT)
  const sets = Array.from({ length: setCount }, (_, index) =>
    cards.slice(index * HOME_PLACES_LIMIT, (index + 1) * HOME_PLACES_LIMIT),
  )
  const selected = Math.min(active, setCount - 1)
  const flipping = showSets && motion && incoming !== null
  const changeSet = useCallback(
    (step: number) => {
      if (setCount < 2 || incoming !== null) return
      const next = (selected + step + setCount) % setCount
      if (motion) setIncoming(next)
      else setActive(next)
    },
    [incoming, motion, selected, setCount],
  )
  const advance = useCallback(() => changeSet(1), [changeSet])
  const finish = useCallback(() => {
    if (incoming === null) return
    setActive(incoming)
    setIncoming(null)
  }, [incoming])

  useEffect(() => {
    if (incoming === null) return
    // Also settle if a resize or motion preference change cancels the CSS animation.
    const timer = setTimeout(finish, FLIP_FALLBACK_DELAY)
    return () => clearTimeout(timer)
  }, [incoming, finish])

  useVisibleRotation(
    root,
    showSets && motion && setCount > 1 && incoming === null && !paused && !hovered && !focused,
    advance,
    selected,
    HOME_PLACES_DELAY,
  )

  if (!showSets) {
    return (
      <ul className={HOME_PLACES_GRID}>
        {cards.slice(0, HOME_PLACES_LIMIT).map((card) => (
          <li key={card.key} className="min-w-0" data-vd-reveal>
            {card.content}
          </li>
        ))}
      </ul>
    )
  }

  const playbackLabel = paused ? 'Resume listing rotation' : 'Pause listing rotation'
  return (
    <div ref={root} className="vd-place-sets" data-flipping={flipping}>
      {setCount > 1 ? (
        <div className="vd-place-set-controls" role="group" aria-label="Listing navigation">
          <button
            type="button"
            aria-label="Previous listings"
            title="Previous listings"
            onClick={() => changeSet(-1)}
          >
            <ArrowLeft size={17} aria-hidden />
          </button>
          {motion ? (
            <button
              type="button"
              aria-label={playbackLabel}
              title={playbackLabel}
              onClick={() => setPaused((current) => !current)}
            >
              {paused ? <Play size={17} aria-hidden /> : <Pause size={17} aria-hidden />}
            </button>
          ) : null}
          <button type="button" aria-label="Next listings" title="Next listings" onClick={advance}>
            <ArrowRight size={17} aria-hidden />
          </button>
          <span className="sr-only" aria-live={motion && !paused ? 'off' : 'polite'}>
            Listings {selected * HOME_PLACES_LIMIT + 1} to{' '}
            {Math.min((selected + 1) * HOME_PLACES_LIMIT, cards.length)} of {cards.length}
          </span>
        </div>
      ) : null}
      <div
        className="vd-place-board"
        onPointerEnter={(event) => {
          if (event.pointerType !== 'touch') setHovered(true)
        }}
        onPointerLeave={() => setHovered(false)}
        onFocusCapture={() => setFocused(true)}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false)
        }}
      >
        {sets.map((set, index) => (
          <ul
            className={`${HOME_PLACES_GRID} vd-place-set`}
            key={index}
            data-current={selected === index}
            data-arriving={flipping && incoming === index}
            inert={flipping}
            onAnimationEnd={(event) => {
              if (
                incoming === index &&
                set.length >= (sets[selected]?.length ?? 0) &&
                event.animationName === 'vd-place-flip-reveal' &&
                event.target === event.currentTarget.lastElementChild
              ) {
                finish()
              }
            }}
          >
            {set.map((card) => (
              <li key={card.key} className="min-w-0">
                {card.content}
              </li>
            ))}
          </ul>
        ))}
      </div>
    </div>
  )
}
