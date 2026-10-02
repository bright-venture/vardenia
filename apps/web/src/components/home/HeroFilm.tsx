'use client'

/**
 * The masthead's moving picture: the film once, then a tour of Lebanon.
 *
 * The approved film plays a single time. When it ends (or cannot play at all,
 * because autoplay is blocked or the codec is missing) it fades into a slow
 * sequence of photographs, coast to Beqaa, each held for six seconds with a
 * gentle drift and captioned with where it is and who took it. That is the
 * designer's arrangement from the October 2026 redesign.
 *
 * # What loads, and when
 *
 * The server renders the film's poster underneath as a priority image, so the
 * first paint never waits for any of this. The photographs are not mounted
 * until the film is a few seconds from its end: six full-width pictures on a
 * phone connection would otherwise compete with the film they are waiting for.
 * Phones get the smaller encode of the film through the `media` attribute on
 * its first source.
 *
 * # Less motion
 *
 * A reader who asked their system for less movement gets the first photograph,
 * still, and no film. The preference is read through `useSyncExternalStore`, so
 * the server and the first client render agree (motion on) and the switch
 * happens as an ordinary update rather than a hydration mismatch.
 */

import Image from 'next/image'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'

export interface HeroSlide {
  /** File stem in /public/hero, for example `beirut`. */
  base: string
  place: string
  note: string
  credit: string
}

const FILM = {
  desktop: '/hero/hero-film.mp4',
  mobile: '/hero/hero-film-m.mp4',
  poster: '/hero/film-poster.webp',
}

/** How long each photograph holds before the next fades in. */
const SLIDE_MS = 6000
/** Mount the photographs this long before the film ends, so the first is ready. */
const PRELOAD_BEFORE_END_S = 5

const MOTION_QUERY = '(prefers-reduced-motion: reduce)'
const subscribeMotion = (onChange: () => void) => {
  const query = window.matchMedia(MOTION_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}
const readReduced = () => window.matchMedia(MOTION_QUERY).matches
const serverReduced = () => false

export function HeroFilm({ slides, photoBy }: { slides: HeroSlide[]; photoBy: string }) {
  const reduced = useSyncExternalStore(subscribeMotion, readReduced, serverReduced)
  const film = useRef<HTMLVideoElement | null>(null)

  const [filmEnded, setFilmEnded] = useState(false)
  const [stillsMounted, setStillsMounted] = useState(false)
  const [shown, setShown] = useState(0)

  const filmDone = reduced || filmEnded
  const showStills = reduced || stillsMounted || filmEnded

  useEffect(() => {
    if (reduced) return
    const video = film.current
    if (!video) return

    const finish = () => setFilmEnded(true)
    const nearEnd = () => {
      if (
        Number.isFinite(video.duration) &&
        video.currentTime > video.duration - PRELOAD_BEFORE_END_S
      ) {
        setStillsMounted(true)
      }
    }

    video.addEventListener('ended', finish)
    video.addEventListener('error', finish)
    video.addEventListener('timeupdate', nearEnd)
    // Autoplay refused (a data-saver mode, a strict browser): go straight to
    // the photographs rather than leaving a frozen first frame.
    video.play().catch(finish)

    return () => {
      video.removeEventListener('ended', finish)
      video.removeEventListener('error', finish)
      video.removeEventListener('timeupdate', nearEnd)
    }
  }, [reduced])

  useEffect(() => {
    if (reduced || !filmEnded) return
    const id = window.setInterval(() => setShown((s) => (s + 1) % slides.length), SLIDE_MS)
    return () => window.clearInterval(id)
  }, [reduced, filmEnded, slides.length])

  const current = reduced ? 0 : shown
  const caption = slides[current]

  return (
    <>
      {showStills
        ? slides.map((slide, i) => {
            const visible = filmDone && i === current
            return (
              <Image
                key={slide.base}
                src={`/hero/${slide.base}.webp`}
                alt={i === 0 ? `${slide.place}, ${slide.note}` : ''}
                aria-hidden={i === 0 ? undefined : true}
                fill
                sizes="100vw"
                quality={70}
                className={[
                  'hero-fade -z-10 object-cover',
                  visible && !reduced ? (i % 2 === 0 ? 'hero-drift-a' : 'hero-drift-b') : '',
                ].join(' ')}
                style={{ opacity: visible ? 1 : 0 }}
              />
            )
          })
        : null}

      {reduced ? null : (
        <video
          ref={film}
          className="hero-video hero-fade pointer-events-none absolute inset-0 -z-10 h-full w-full object-cover"
          style={{ opacity: filmEnded ? 0 : 1 }}
          muted
          playsInline
          preload="auto"
          poster={FILM.poster}
          aria-hidden
        >
          <source src={FILM.mobile} type="video/mp4" media="(max-width: 767px)" />
          <source src={FILM.desktop} type="video/mp4" />
        </video>
      )}

      {/*
        Where this photograph is, once the film has handed over. Keyed on the
        slide so each caption rises in with its picture; polite, so a screen
        reader hears the place without being interrupted.
      */}
      {filmDone && caption ? (
        <div
          key={current}
          aria-live="polite"
          className="absolute bottom-6 end-24 max-w-[60vw] animate-[rise_1.4s_cubic-bezier(0,0,0,1)_0.15s_both] text-end lg:end-28"
        >
          <p className="text-surface-base/85 font-mono text-[10px] uppercase tracking-[0.2em]">
            {caption.place}
          </p>
          <p className="text-surface-base/55 mt-1 text-[11px] leading-snug">
            {caption.note} · {photoBy} {caption.credit} / Pexels
          </p>
        </div>
      ) : null}
    </>
  )
}
