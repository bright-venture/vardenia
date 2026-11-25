'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useLocale } from 'next-intl'
import { useEnglishHomeEdition } from '../editorial/useDesktopEdition'
import { usePathname } from '../../i18n/routing'

/** The homepage opens over the film; menus and the remaining pages use paper. */
export function HeaderBar({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const englishHome = useEnglishHomeEdition(useLocale())
  const home = englishHome && pathname === '/'
  const [overHero, setOverHero] = useState(true)

  useEffect(() => {
    if (!home) return
    let frame = 0
    const update = () => {
      frame = 0
      const hero = document.querySelector(
        matchMedia('(max-width: 700px)').matches ? '.vd-hero-media' : '.vd-hero-track',
      )
      const header = document.querySelector('.vd-header')
      setOverHero(Boolean(hero && hero.getBoundingClientRect().bottom > (header?.getBoundingClientRect().height ?? 80)))
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    window.addEventListener('pageshow', schedule)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      window.removeEventListener('pageshow', schedule)
    }
  }, [home, pathname])

  return <header className="vd-header" data-home={home || undefined} data-overlay={(home && overHero) || undefined}>{children}</header>
}
