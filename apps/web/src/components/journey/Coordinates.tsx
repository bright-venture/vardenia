'use client'
import { useEffect, useRef } from 'react'
import { coordinates } from './destinations'
export function Coordinates({
  place,
  enabled,
  label,
  className = '',
}: {
  place: { lat: number; lon: number }
  enabled: boolean
  label?: string
  className?: string
}) {
  const root = useRef<HTMLSpanElement>(null),
    digits = useRef<HTMLSpanElement>(null)
  const value = coordinates(place)
  useEffect(() => {
    const el = root.current,
      node = digits.current
    if (!el || !node) return
    let frame = 0,
      visible = false
    const animations: Animation[] = []
    const finish = () => {
      cancelAnimationFrame(frame)
      node.textContent = value
      animations.forEach((a) => a.cancel())
      animations.length = 0
      el.dataset.state = 'settled'
    }
    const locate = () => {
      finish()
      let off = false
      try {
        off = localStorage.getItem('vardenia-motion') === 'off'
      } catch {}
      if (
        !enabled ||
        document.hidden ||
        off ||
        matchMedia('(prefers-reduced-motion: reduce)').matches
      )
        return
      el.dataset.state = 'locating'
      animations.push(
        node.animate(
          [
            { opacity: 0, transform: 'translateY(8px)' },
            { opacity: 1, transform: 'translateY(0)' },
          ],
          { duration: 350, easing: 'cubic-bezier(.23,1,.32,1)' },
        ),
      )
      const name = el.querySelector('.vd-coordinate-place')
      if (name)
        animations.push(
          name.animate(
            [
              { opacity: 0, transform: 'translateY(8px)' },
              { opacity: 1, transform: 'translateY(0)' },
            ],
            { duration: 500, delay: 430, fill: 'backwards', easing: 'cubic-bezier(.23,1,.32,1)' },
          ),
        )
      const count = [...value].filter((c) => /\d/.test(c)).length
      let start: number | undefined,
        last = -1
      const tick = (now: number) => {
        if (document.hidden) {
          finish()
          return
        }
        start ??= now
        const t = now - start
        if (t >= 1000) {
          finish()
          return
        }
        const step = Math.floor(t / 42)
        if (step !== last) {
          last = step
          let i = 0
          node.textContent = [...value]
            .map((c) => {
              if (!/\d/.test(c)) return c
              const settled = t >= 160 + (i++ / Math.max(1, count - 1)) * 680
              return settled ? c : String((Number(c) + step + i * 3) % 10)
            })
            .join('')
        }
        frame = requestAnimationFrame(tick)
      }
      frame = requestAnimationFrame(tick)
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const e = entries[0]
        if (!e) return
        if (e.intersectionRatio >= 0.65 && !visible) {
          visible = true
          locate()
        } else if (!e.isIntersecting) {
          visible = false
          finish()
        }
      },
      { threshold: [0, 0.65] },
    )
    observer.observe(el)
    const onHidden = () => {
      if (document.hidden) finish()
    }
    document.addEventListener('visibilitychange', onHidden)
    document.addEventListener('keydown', finish)
    return () => {
      finish()
      observer.disconnect()
      document.removeEventListener('visibilitychange', onHidden)
      document.removeEventListener('keydown', finish)
    }
  }, [enabled, value, label])
  return (
    <span ref={root} className={`vd-coordinates ${className}`}>
      <span className="sr-only">{value}</span>
      <span ref={digits} className="vd-coordinate-digits" aria-hidden dir="ltr">
        {value}
      </span>
      {label && <span className="vd-coordinate-place">{label}</span>}
    </span>
  )
}
