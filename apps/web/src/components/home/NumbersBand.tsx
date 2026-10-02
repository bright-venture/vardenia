'use client'

/**
 * Four figures on navy, in gold that catches a sweep of light once as the band
 * comes into view (`.shimmer-text` in globals.css).
 *
 * The figures are passed in measured, not written: the page counts places and
 * printed codes. Latin digits in every language, like the masthead's.
 */

import { useRef } from 'react'
import { useInViewOnce } from '../../lib/motion'

export function NumbersBand({ figures }: { figures: [value: string, label: string][] }) {
  const ref = useRef<HTMLDListElement>(null)
  const inView = useInViewOnce(ref, 0.4)

  return (
    <section className="border-gold-500/20 bg-cedar-900 text-surface-base border-y">
      <dl
        ref={ref}
        className="mx-auto grid max-w-7xl grid-cols-2 gap-y-10 px-5 py-14 lg:grid-cols-4 lg:px-10"
      >
        {figures.map(([value, label], i) => (
          <div key={label} className="group flex flex-col-reverse items-center gap-2 text-center">
            <dt className="text-surface-base/50 group-hover:text-surface-base/80 font-mono text-[11px] uppercase tracking-[0.16em] transition-colors duration-500">
              {label}
            </dt>
            <dd
              className={[
                'shimmer-text font-mono text-4xl tabular-nums transition-transform duration-500 group-hover:-translate-y-1 lg:text-5xl',
                inView ? 'is-shining' : '',
              ].join(' ')}
              style={{ animationDelay: `${i * 180}ms` }}
            >
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
