'use client'

/**
 * Where to go, as a set of large place names over a photograph that changes
 * with the one you are pointing at.
 *
 * # Why this one is a client component when the rest of the home page is not
 *
 * The swap is the whole idea: pointing at "Beirut" brings up Beirut behind the
 * list. That is a hover/focus interaction, which needs state, which needs the
 * client. It is the only interactive section on the page, so the cost is one
 * small island rather than a client bundle for the whole masthead.
 *
 * The backdrops are all rendered and cross-faded by opacity rather than swapped
 * in the `src`, so pointing down the list does not flash a blank frame while the
 * next photograph loads. They are `loading="lazy"`: this section is far below
 * the fold, so none of them are on the critical path.
 *
 * # Keyboard and reading direction
 *
 * `onFocus` mirrors `onMouseEnter`, so tabbing through the links moves the
 * backdrop the same way hovering does. The nudge and the arrow flip under RTL so
 * they travel along the reading direction rather than across it, and the whole
 * side wash falls on the start edge in both.
 */

import { useState } from 'react'
import Image from 'next/image'
import { ArrowUpRight } from 'lucide-react'
import type { Locale } from '@vardenia/i18n'
import { Link } from '../../i18n/routing'

/**
 * The five regions the index features, with their backdrops. Slugs match the
 * governorates the directory filters on (`/directory?where=<slug>`), so every
 * name resolves to a real filtered view. The set is a curated five, not all
 * eight governorates: the index is a taste, and the directory's own region rail
 * is where the full list lives.
 */
const REGIONS: { slug: string; en: string; ar: string; img: string }[] = [
  { slug: 'beirut', en: 'Beirut', ar: 'بيروت', img: '/images/l-rooftop.jpg' },
  { slug: 'mount-lebanon', en: 'Mount Lebanon', ar: 'جبل لبنان', img: '/images/l-village.jpg' },
  { slug: 'north-lebanon', en: 'North Lebanon', ar: 'لبنان الشمالي', img: '/images/l-beach.jpg' },
  { slug: 'beqaa', en: 'Beqaa', ar: 'البقاع', img: '/images/cat-eat.jpg' },
  { slug: 'south-lebanon', en: 'South Lebanon', ar: 'لبنان الجنوبي', img: '/images/l-baher.jpg' },
]

export function RegionIndex({
  locale,
  eyebrow,
  title,
}: {
  locale: Locale
  eyebrow: string
  title: string
}) {
  const ar = locale === 'ar'
  const [active, setActive] = useState(0)

  return (
    <section className="bg-ink-900 relative overflow-hidden">
      {/* Backdrops, cross-faded on the active region. */}
      <div aria-hidden className="absolute inset-0">
        {REGIONS.map((r, i) => (
          <div
            key={r.slug}
            className={`absolute inset-0 transition-opacity duration-700 ${
              active === i ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <Image src={r.img} alt="" fill sizes="100vw" loading="lazy" className="object-cover" />
          </div>
        ))}
      </div>
      {/* Two washes: an overall darkener so any photograph carries white type,
          and a start-edge gradient so the list itself stays legible. */}
      <div aria-hidden className="bg-cedar-900/55 absolute inset-0" />
      <div
        aria-hidden
        className="from-cedar-900/80 via-cedar-900/40 absolute inset-0 bg-gradient-to-r to-transparent rtl:bg-gradient-to-l"
      />

      <div className="relative mx-auto max-w-6xl px-6 py-24 sm:py-32">
        <p className="text-gold-300 font-mono text-[11px] tracking-[0.2em] uppercase">{eyebrow}</p>
        <h2 className="text-surface-base/90 mt-3 max-w-xl text-3xl leading-tight sm:text-4xl lg:text-5xl">
          {title}
        </h2>

        <ul className="mt-12 flex flex-col items-start gap-1 sm:mt-16 lg:gap-2">
          {REGIONS.map((r, i) => (
            <li key={r.slug}>
              <Link
                href={`/directory?where=${r.slug}`}
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                className={`group inline-flex items-baseline gap-4 leading-[1.05] transition-colors duration-300 ${
                  active === i ? 'text-gold-300' : 'text-surface-base/85 hover:text-surface-base'
                } text-3xl sm:text-5xl lg:text-7xl`}
              >
                <span
                  aria-hidden
                  className={`font-mono text-xs tracking-[0.2em] ${
                    active === i ? 'text-gold-300' : 'text-cedar-100/40'
                  }`}
                >
                  {String(i + 1).padStart(2, '0')}
                </span>
                {/* The active name leans italic in English for emphasis; Arabic
                    has no true italic, so there the gold colour carries it. */}
                <span className={active === i && !ar ? 'italic' : ''}>{ar ? r.ar : r.en}</span>
                <ArrowUpRight
                  aria-hidden
                  size={26}
                  className={`self-center transition-all duration-300 rtl:-scale-x-100 ${
                    active === i
                      ? 'text-gold-300 translate-x-1 opacity-100 rtl:-translate-x-1'
                      : 'opacity-0'
                  }`}
                />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
