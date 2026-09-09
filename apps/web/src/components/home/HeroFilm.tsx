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
 * The sequence, ordered light-first for load weight.
 *
 * The sea clip is the designer's opener and its still is the poster, but it is
 * also 10MB against 0.4-1.2MB for the others. Leading with it meant the first
 * thing the page streamed was that 10MB, on the masthead of the busiest page.
 * So the light clips lead and sea plays last: by the time the cycle reaches it -
 * four holds, near half a minute in - a reader either left long ago or is
 * plainly staying, and its weight is theirs to spend rather than everyone's on
 * arrival. The poster (see components/home/Hero) is a still of this first clip,
 * so the first frame painted and the first frame played are the same.
 */
const CLIPS = [
  '/videos/hero-mountain.mp4',
  '/videos/hero-waterfall.mp4',
  '/videos/hero-coast.mp4',
  '/videos/hero-cross.mp4',
  '/videos/hero-sea.mp4',
]

/** How long each clip holds before the crossfade to the next begins. */
const HOLD_MS = 7000
/** Must match the `duration-1000` on the layers below. */
const FADE_MS = 1000

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * How eagerly the browser may fetch each clip before it is played.
 *
 * The first clip is `auto`: it plays the moment the page settles, and its still
 * is the poster, so it is worth having ready. The rest carry `metadata` and
 * buffer during the seven seconds the clip before them holds - all except the
 * sea clip, which is `none`.
 *
 * Sea is ~10MB against 0.4-1.2MB for the others, and `metadata` is not the small
 * fetch it sounds like: a reader has to reach an MP4's moov atom to read the
 * metadata, and if the file was not written front-loaded the browser pulls a
 * large slice of those ten megabytes to find it - on page load, for a clip that
 * does not show for nearly half a minute. `none` fetches nothing until the
 * sequence primes it a hold before its turn, which is when it was going to
 * buffer anyway.
 */
const preloadFor = (src: string, index: number): 'auto' | 'metadata' | 'none' => {
  if (index === 0) return 'auto'
  if (src.includes('hero-sea')) return 'none'
  return 'metadata'
}

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
          // See preloadFor: first clip eager, sea fetched only when primed, the
          // rest metadata until their turn comes round.
          preload={preloadFor(src, i)}
          aria-hidden
        >
          <source src={src} type="video/mp4" />
        </video>
      ))}
    </>
  )
}
