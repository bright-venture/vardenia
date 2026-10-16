'use client'
import { useEffect, useRef, type ReactNode } from 'react'
import { usePathname } from '../../i18n/routing'
import { useJourneyMotion } from '../journey/browser-state'

/** Progressive enhancement: server-rendered content is visible before JS and on failure. */
export function PageMotion({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null)
  const keyboardMode = useRef(false)
  const pathname = usePathname()
  const [motion] = useJourneyMotion()
  useEffect(() => {
    const host = root.current
    if (
      !host ||
      pathname === '/' ||
      !motion ||
      document.hidden ||
      matchMedia('(prefers-reduced-motion: reduce)').matches
    )
      return
    let keyboard = keyboardMode.current,
      frame = 0
    const animations = new Set<Animation>()
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return
          observer.unobserve(entry.target)
          if (keyboard || document.hidden) return
          const animation = entry.target.animate(
            [
              { opacity: 0.35, transform: 'translateY(24px)' },
              { opacity: 1, transform: 'translateY(0)' },
            ],
            { duration: 650, easing: 'cubic-bezier(.23,1,.32,1)' },
          )
          animations.add(animation)
          animation.onfinish = () => animations.delete(animation)
        })
      },
      { threshold: 0.12 },
    )
    const selector =
      '[data-vd-reveal],.vd-story-section h2,.vd-story-section .vd-story-body,.vd-article-card,.vd-subcategories li'
    const seen = new WeakSet<Element>()
    const observe = (element: Element) => {
      if (seen.has(element)) return
      seen.add(element)
      observer.observe(element)
    }
    host.querySelectorAll(selector).forEach(observe)
    // Streamed results and client-side filtering can arrive after the initial effect.
    const streamed = new MutationObserver((records) =>
      records.forEach((record) =>
        record.addedNodes.forEach((node) => {
          if (!(node instanceof Element)) return
          if (node.matches(selector)) observe(node)
          node.querySelectorAll(selector).forEach(observe)
        }),
      ),
    )
    streamed.observe(host, { childList: true, subtree: true })
    const photos = [...host.querySelectorAll<HTMLElement>('.vd-inner-hero-media img')]
    const paint = () => {
      frame = 0
      if (keyboard || document.hidden) return
      photos.forEach((image) => {
        const box = image.parentElement!.getBoundingClientRect()
        if (box.bottom > 0 && box.top < innerHeight)
          image.style.transform = `translateY(${Math.min(25, Math.max(-25, -box.top * 0.045))}px) scale(1.08)`
      })
    }
    const scroll = () => {
      if (!frame) frame = requestAnimationFrame(paint)
    }
    const stop = () => {
      animations.forEach((a) => a.cancel())
      animations.clear()
      photos.forEach((p) => p.style.removeProperty('transform'))
    }
    const key = (event: KeyboardEvent) => {
      if (['Tab', 'Enter', ' '].includes(event.key)) {
        keyboardMode.current = true
        keyboard = true
        stop()
      }
    }
    const pointer = () => {
      keyboardMode.current = false
      keyboard = false
    }
    window.addEventListener('pointerdown', pointer)
    const visibility = () => {
      if (document.hidden) stop()
      else scroll()
    }
    window.addEventListener('scroll', scroll, { passive: true })
    document.addEventListener('keydown', key)
    document.addEventListener('visibilitychange', visibility)
    scroll()
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      streamed.disconnect()
      stop()
      window.removeEventListener('pointerdown', pointer)
      window.removeEventListener('scroll', scroll)
      document.removeEventListener('keydown', key)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [pathname, motion])
  return (
    <div ref={root} className={`vd-page-flow flex-1 ${motion ? '' : 'vd-inner-motion-off'}`}>
      {children}
    </div>
  )
}
