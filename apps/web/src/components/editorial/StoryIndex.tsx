'use client'

import { useEffect, useRef, useState } from 'react'
import { LinkArrow } from '../LinkArrow'

interface StorySection {
  id: string
  heading: string
}

/** Native links remain usable without JavaScript; enhancement opens linked FAQ answers. */
export function StoryIndex({ title, sections }: { title: string; sections: StorySection[] }) {
  const [current, setCurrent] = useState(sections[0]?.id ?? '')
  const requested = useRef<{ id: string; seen: boolean } | null>(null)

  useEffect(() => {
    const revealHash = () => {
      const id = window.location.hash.slice(1)
      if (!sections.some((section) => section.id === id)) return
      requested.current = { id, seen: false }
      const target = document.getElementById(id)
      if (target instanceof HTMLDetailsElement) target.open = true
      setCurrent(id)
    }
    revealHash()
    window.addEventListener('hashchange', revealHash)

    // Reading by scroll should keep the same orientation cue as using the index.
    const visibleSections = new Set<string>()
    const followReading = () => {
      const firstVisible = sections.find(({ id }) => visibleSections.has(id))
      if (firstVisible) setCurrent(firstVisible.id)
    }
    const releaseRequested = () => {
      requested.current = null
      followReading()
    }
    const onWheel = (event: WheelEvent) => {
      if (event.deltaY && !event.ctrlKey && !event.shiftKey) releaseRequested()
    }
    const onTouchMove = (event: TouchEvent) => {
      if (!(event.target as Element | null)?.closest?.('.vd-reading-index')) releaseRequested()
    }
    const onScrollKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return
      if (event.key === ' ' && target?.closest('button, summary')) return
      if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) {
        releaseRequested()
      }
    }
    window.addEventListener('wheel', onWheel, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: true })
    window.addEventListener('keydown', onScrollKey)
    let observer: IntersectionObserver | null = null
    let generation = 0
    const observeSections = () => {
      observer?.disconnect()
      visibleSections.clear()
      if (requested.current) requested.current.seen = false
      const currentGeneration = ++generation
      if (typeof IntersectionObserver === 'undefined') return
      // Percentage root margins resolve against WIDTH, even for top/bottom.
      // Use layout-viewport pixels and retain a positive band on short screens.
      const height = Math.max(1, window.innerHeight || document.documentElement.clientHeight)
      const top = Math.min(120, height - 1)
      const bottom = Math.min(Math.round(height * 0.55), height - top - 1)
      observer = new IntersectionObserver(
        (entries) => {
          if (currentGeneration !== generation) return
          // Observer callbacks contain changes, not every visible section.
          entries.forEach((entry) => {
            if (entry.isIntersecting) visibleSections.add(entry.target.id)
            else visibleSections.delete(entry.target.id)
          })
          const selected = requested.current
          if (selected) {
            if (visibleSections.has(selected.id)) selected.seen = true
            // An explicit destination wins over a preceding question still
            // in view, and over stale callbacks during native anchor scroll.
            if (!selected.seen || visibleSections.has(selected.id)) return
            requested.current = null
          }
          followReading()
        },
        { rootMargin: `-${top}px 0px -${bottom}px 0px`, threshold: 0 },
      )
      sections.forEach(({ id }) => {
        const section = document.getElementById(id)
        if (section) observer?.observe(section)
      })
    }
    observeSections()
    window.addEventListener('resize', observeSections)
    return () => {
      window.removeEventListener('hashchange', revealHash)
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('keydown', onScrollKey)
      window.removeEventListener('resize', observeSections)
      generation++
      observer?.disconnect()
    }
  }, [sections])

  return (
    <nav className="vd-reading-index" aria-label={title}>
      {sections.map((section, index) => (
        <a
          key={section.id}
          href={`#${section.id}`}
          aria-current={current === section.id ? 'location' : undefined}
          onClick={() => {
            requested.current = { id: section.id, seen: false }
            const target = document.getElementById(section.id)
            if (target instanceof HTMLDetailsElement) {
              target.open = true
              target.querySelector('summary')?.focus({ preventScroll: true })
            } else {
              target?.focus({ preventScroll: true })
            }
            setCurrent(section.id)
          }}
        >
          <span className="vd-reading-number" aria-hidden="true">
            {String(index + 1).padStart(2, '0')}
          </span>
          <span className="vd-reading-label">{section.heading}</span>
          <LinkArrow />
        </a>
      ))}
    </nav>
  )
}
