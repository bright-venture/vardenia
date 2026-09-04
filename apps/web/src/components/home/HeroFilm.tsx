'use client'

/**
 * The masthead's film: five Lebanon clips, cross-faded on a timer.
 *
 * # Why a timer, and not scroll
 *
 * The commissioned prototype drove the clips from scroll position. That is the
 * behaviour the designer asked us to drop: scrubbing a video with the scrollbar
 * makes it jump and restart as the page moves. So the sequence advances on its
 * own clock here and reads nothing from scroll at all - it plays straight
 * through whether the reader is moving or still, and can never restart under
 * them.
 *
 * # Why it is the one client island in the masthead
 *
 * Everything else in the hero is server-rendered; only the crossfade needs
 * state and a timer, so only this is a client component. It renders the video
 * layers over the server-rendered poster (which is the LCP) and the gradients
 * sit over the top of it - see components/home/Hero for the stack.
 *
 * # Only two clips ever decode at once
 *
 * The current clip and the one after it are played; everything else is paused
 * once the crossfade finishes. Priming the next clip a whole hold-length before
 * it is shown means the switch is a fade between two already-playing videos
 * rather than a fade into a black frame that is still buffering. Pausing never
 * resets a video, so a clip resumes where it left off when the loop comes back
 * around.
 *
 * # Reduced motion
 *
 * A reader who asked their system for less movement gets no timer, no autoplay
 * and no video: the `.hero-video` rule in globals.css removes the elements, and
 * the poster underneath is what stays. The effects below bail out for the same
 * reason, so no clip is ever told to play.
 */

import { useEffect, useRef, useState } from 'react'

/**
 * The sequence. Sea first, because the poster is its still - so the first thing
 * painted and the first thing played are the same frame. The rest are an order
 * the designer set: coast, waterfall, hillside, mountain dusk.
 */
const CLIPS = [
  '/videos/hero-sea.mp4',
  '/videos/hero-coast.mp4',
  '/videos/hero-waterfall.mp4',
  '/videos/hero-cross.mp4',
  '/videos/hero-mountain.mp4',
]

/** How long each clip holds before the crossfade to the next begins. */
const HOLD_MS = 7000
/** Must match the `duration-1000` on the layers below. */
const FADE_MS = 1000

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function HeroFilm() {
  const [active, setActive] = useState(0)
  const videos = useRef<(HTMLVideoElement | null)[]>([])

  // The clock. One interval, advancing the active clip and wrapping around.
  useEffect(() => {
    if (prefersReducedMotion()) return
    const id = setInterval(() => setActive((prev) => (prev + 1) % CLIPS.length), HOLD_MS)
    return () => clearInterval(id)
  }, [])

  // Play the current clip and prime the next; pause the rest once the fade ends.
  useEffect(() => {
    if (prefersReducedMotion()) return
    const next = (active + 1) % CLIPS.length

    for (const i of [active, next]) {
      const v = videos.current[i]
      if (v?.paused) v.play().catch(() => {})
    }

    const timeout = setTimeout(() => {
      videos.current.forEach((v, i) => {
        if (i !== active && i !== next && v && !v.paused) v.pause()
      })
    }, FADE_MS + 200)

    return () => clearTimeout(timeout)
  }, [active])

  return (
    <>
      {CLIPS.map((src, i) => (
        <video
          key={src}
          ref={(el) => {
            videos.current[i] = el
          }}
          className="hero-video absolute inset-0 -z-10 h-full w-full object-cover transition-opacity duration-1000"
          style={{ opacity: i === active ? 1 : 0 }}
          muted
          loop
          playsInline
          // Only the first clip is worth fetching ahead of play; the rest carry
          // metadata until the sequence reaches them, then buffer during the
          // seven seconds the clip before them is on screen.
          preload={i === 0 ? 'auto' : 'metadata'}
          aria-hidden
        >
          <source src={src} type="video/mp4" />
        </video>
      ))}
    </>
  )
}
