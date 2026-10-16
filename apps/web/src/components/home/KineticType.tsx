'use client'

/**
 * A sentence set like letterpress as the reader scrolls: words drop in one by
 * one with a small settle, and the accent word stamps last, in gold.
 *
 * The section is pinned for a screen and a half while that happens, so the
 * scroll itself is the timeline. The sentence is split with `Intl.Segmenter`
 * rather than on spaces, because Chinese has none and Hindi, Bengali and Urdu
 * words are not always where a space split would put them.
 *
 * The sentence remains one semantic heading. Server/no-script rendering and
 * the shared motion-off preference show the complete sentence, with its gold accent.
 */

import { useMemo, useRef, useSyncExternalStore } from 'react'
import { clamp01, smooth, usePinProgress } from '../../lib/motion'
import { useJourneyMotion } from '../journey/browser-state'

const subscribeReady = () => () => {}
const clientReady = () => true
const serverReady = () => false

interface Segment {
  text: string
  /** Position among the words only, or -1 for spaces and punctuation. */
  index: number
}

function segmentsOf(text: string, locale: string): Segment[] {
  const parts =
    typeof Intl !== 'undefined' && 'Segmenter' in Intl
      ? [...new Intl.Segmenter(locale, { granularity: 'word' }).segment(text)].map((s) => ({
          text: s.segment,
          word: Boolean(s.isWordLike),
        }))
      : text.split(/(\s+)/).map((part) => ({ text: part, word: /\S/.test(part) }))

  // Punctuation rides with the word before it, so a full stop arrives with its
  // word instead of waiting on the page ahead of it.
  const merged: { text: string; word: boolean }[] = []
  for (const part of parts) {
    const previous = merged.at(-1)
    if (!part.word && !/\s/.test(part.text) && previous?.word) previous.text += part.text
    else merged.push({ ...part })
  }

  let words = 0
  return merged.map((part) => ({ text: part.text, index: part.word ? words++ : -1 }))
}

export function KineticType({
  text,
  accent,
  locale,
  className = '',
  headingId,
}: {
  text: string
  /** The word that stamps last, exactly as it appears in `text`. */
  accent: string
  locale: string
  className?: string
  headingId?: string
}) {
  const [motion] = useJourneyMotion()
  const ready = useSyncExternalStore(subscribeReady, clientReady, serverReady)
  const disabled = !motion || !ready
  const ref = useRef<HTMLDivElement>(null)
  const progress = usePinProgress(ref, disabled)

  const segments = useMemo(() => segmentsOf(text, locale), [text, locale])
  const words = segments.filter((s) => s.index >= 0).length
  const accentIndex = segments.find((s) => s.index >= 0 && s.text.startsWith(accent))?.index ?? -1

  /** 0..1 for word `i`: the accent is held back for the end of the pin. */
  const wordProgress = (i: number) => {
    const isAccent = i === accentIndex
    const start = isAccent ? 0.82 : (i / Math.max(words, 1)) * 0.78
    const span = isAccent ? 0.16 : 0.1
    return smooth(clamp01((progress - start) / span))
  }

  return (
    <div
      ref={ref}
      className={`vd-kinetic-track ${disabled ? 'vd-kinetic-static' : ''}`}
      style={{ height: disabled ? 'auto' : '160svh' }}
    >
      <div className="vd-kinetic-stage">
        <h2 id={headingId} className={className}>
          {segments.map((segment, i) => {
            if (segment.index < 0) return <span key={i}>{segment.text}</span>
            const p = disabled ? 1 : wordProgress(segment.index)
            const isAccent = segment.index === accentIndex
            const settle = p > 0.7 && p < 1 ? (p - 0.85) * 30 : 0
            return (
              <span
                key={i}
                className={`vd-kinetic-word ${isAccent ? 'vd-manifesto-emphasis' : ''}`}
                style={
                  disabled
                    ? undefined
                    : {
                        opacity: p,
                        transform: `translateY(${(1 - p) * (isAccent ? 26 : 40) - settle}px) scale(${isAccent ? 0.96 + p * 0.04 : 1})`,
                      }
                }
              >
                {segment.text}
              </span>
            )
          })}
        </h2>
      </div>
    </div>
  )
}
