'use client'

/**
 * The scan: the home page's signature moment, from the October 2026 redesign.
 *
 * A pinned sequence scrubbed by scroll. The printed table card rises with a
 * phone beside it, a gold line sweeps the code, then the card sinks while the
 * phone's printed page dissolves into the live listing. Three captions follow
 * the three steps; the last frame offers that listing.
 *
 * The listing on the phone is a real one, passed in by the page, so the link at
 * the end goes somewhere true. A reader who asked for less motion gets the three
 * steps side by side instead.
 */

import Image from 'next/image'
import { useRef } from 'react'
import { Link } from '../../i18n/routing'
import { Accent } from '../Accent'
import { clamp01, smooth, usePinProgress, useReducedMotion } from '../../lib/motion'

export interface ScanStep {
  title: string
  sub: string
}

export interface ScanListing {
  name: string
  slug: string
  place: string | null
  tagline: string | null
  /** Its main photograph, or null to show the navy ground. */
  image: string | null
}

const number = (i: number) => String(i + 1).padStart(2, '0')

export function ScanSequence({
  label,
  title,
  steps,
  end,
  openLabel,
  bookLabel,
  listing,
}: {
  label: string
  title: string
  steps: ScanStep[]
  end: string
  openLabel: string
  bookLabel: string
  listing: ScanListing
}) {
  const reduced = useReducedMotion()
  const outer = useRef<HTMLElement>(null)
  const p = usePinProgress(outer, reduced)
  const href = `/directory/${listing.slug}`

  if (reduced) {
    return (
      <section className="bg-surface-raised">
        <div className="mx-auto max-w-7xl px-5 py-24 lg:px-10 lg:py-32">
          <p className="text-gold-700 font-mono text-[11px] uppercase tracking-[0.16em]">{label}</p>
          <h2 className="text-ink-900 mt-3 max-w-2xl text-4xl leading-[1.05] lg:text-6xl">
            <Accent text={title} accent="ثلاث ثوانٍ" />
          </h2>
          <ol className="mt-16 grid gap-12 lg:grid-cols-3 lg:gap-8">
            {steps.map((step, i) => (
              <li key={step.title} className="flex flex-col items-center text-center">
                <span className="text-gold-700 font-mono text-xs tracking-[0.2em]">
                  {number(i)}
                </span>
                <h3 className="text-ink-900 mt-2 text-2xl">{step.title}</h3>
                <p className="text-ink-500 mt-2 max-w-xs text-sm leading-relaxed">{step.sub}</p>
              </li>
            ))}
          </ol>
          <p className="mt-14 text-center">
            <Link
              href={href}
              className="text-gold-700 hover:text-ink-900 font-mono text-xs uppercase tracking-[0.18em]"
            >
              {end}
            </Link>
          </p>
        </div>
      </section>
    )
  }

  // The timeline, as fractions of the pin:
  //   rise   card and phone come up and settle     0.00 to 0.22
  //   scan   the gold line sweeps the card         0.24 to 0.44
  //   morph  card sinks, page becomes the listing  0.46 to 0.78
  //   outro  the link to the listing               0.80 to 0.96
  const rise = smooth(clamp01(p / 0.22))
  const scan = clamp01((p - 0.24) / 0.2)
  const morph = smooth(clamp01((p - 0.46) / 0.32))
  const outro = smooth(clamp01((p - 0.8) / 0.16))

  const cardY = (1 - rise) * 60 + morph * 46
  // The phone grows less than the prototype's, and lifts as it does, so on a
  // laptop-height screen it never covers the caption beneath it.
  const phoneY = (1 - rise) * 110 - morph * 48
  const phoneScale = 0.92 + rise * 0.08 + morph * 0.12

  const stepIndex = p < 0.24 ? 0 : p < 0.46 ? 1 : 2
  const caption = steps[stepIndex]

  return (
    <section
      ref={outer}
      className="bg-surface-raised relative"
      style={{ height: '380svh' }}
      aria-label={title}
    >
      <div className="sticky top-0 h-[100svh] overflow-hidden">
        <div
          className="absolute inset-x-0 top-0 z-10 mx-auto max-w-7xl px-5 pt-24 lg:px-10 lg:pt-28"
          style={{
            opacity: 1 - clamp01((p - 0.1) / 0.14),
            transform: `translateY(${-morph * 30}px)`,
          }}
        >
          <p className="text-gold-700 font-mono text-[11px] uppercase tracking-[0.16em]">{label}</p>
          <h2 className="text-ink-900 mt-3 max-w-2xl text-4xl leading-[1.05] lg:text-6xl">
            <Accent text={title} accent="ثلاث ثوانٍ" />
          </h2>
        </div>

        <div className="relative mx-auto flex h-full max-w-7xl items-center justify-center gap-6 px-5 sm:gap-10 lg:gap-24 lg:px-10">
          {/* The printed card. */}
          <div
            className="relative w-32 shrink-0 sm:w-52 lg:w-64"
            style={{
              transform: `translateY(${cardY}px) rotate(${-4 + rise * 4 + morph * 5}deg)`,
              opacity: Math.max(0, 1 - morph * 1.6),
              filter: `blur(${morph * 3}px)`,
            }}
          >
            <Image
              src="/images/code-card.jpg"
              alt={steps[0]?.title ?? ''}
              width={690}
              height={870}
              sizes="(min-width: 1024px) 256px, 208px"
              className="shadow-cedar-900/25 w-full shadow-2xl"
            />
            <div
              aria-hidden
              className="bg-gold-500 pointer-events-none absolute inset-x-0 h-[3px] shadow-[0_0_18px_4px_theme(colors.gold.500/55%)]"
              style={{ top: `${scan * 100}%`, opacity: scan > 0 && scan < 1 ? 1 : 0 }}
            />
          </div>

          {/* The phone: the printed page becomes the live listing. */}
          <div
            className="relative w-36 shrink-0 sm:w-52 lg:w-60"
            style={{ transform: `translateY(${phoneY}px) scale(${phoneScale})` }}
          >
            <div className="border-ink-900 bg-cedar-900 shadow-cedar-900/40 relative overflow-hidden rounded-[2rem] border-[6px] shadow-2xl">
              <Image
                src="/images/spread-1.jpg"
                alt=""
                aria-hidden
                width={481}
                height={1121}
                sizes="240px"
                className="aspect-[481/1121] w-full object-cover object-[50%_18%]"
                style={{
                  opacity: 1 - morph,
                  filter: `blur(${morph * 6}px) saturate(${1 - morph * 0.6})`,
                }}
              />
              <div
                aria-hidden
                className="absolute inset-0 flex flex-col"
                style={{ opacity: morph, transform: `translateY(${(1 - morph) * 24}px)` }}
              >
                <div className="relative h-[38%]">
                  {listing.image ? (
                    <Image src={listing.image} alt="" fill sizes="240px" className="object-cover" />
                  ) : null}
                  <div className="from-cedar-900 absolute inset-0 bg-gradient-to-t to-transparent" />
                  <p
                    dir="auto"
                    className="font-display text-surface-base absolute inset-x-0 bottom-2 px-3 text-lg leading-tight"
                  >
                    {listing.name}
                  </p>
                </div>
                <div className="flex flex-1 flex-col gap-2 px-3 py-3">
                  {listing.place ? (
                    <p className="text-gold-300 font-mono text-[9px] uppercase tracking-[0.12em]">
                      {listing.place}
                    </p>
                  ) : null}
                  {listing.tagline ? (
                    <p
                      dir="auto"
                      className="text-surface-base/70 line-clamp-4 text-[10px] leading-relaxed"
                    >
                      {listing.tagline}
                    </p>
                  ) : null}
                  <span className="bg-gold-500 text-cedar-900 mt-auto px-3 py-2 text-center font-mono text-[9px] uppercase tracking-[0.16em]">
                    {bookLabel}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-16 z-10 mx-auto max-w-xl px-5 text-center lg:bottom-20">
          {caption ? (
            <div aria-live="polite" style={{ opacity: clamp01(rise * 1.4 - outro * 2.5) }}>
              <span className="text-gold-700 font-mono text-xs tracking-[0.2em]">
                {number(stepIndex)}
              </span>
              <h3 className="text-ink-900 mt-1.5 text-2xl">{caption.title}</h3>
              <p className="text-ink-500 mt-1.5 text-sm leading-relaxed">{caption.sub}</p>
            </div>
          ) : null}
          {/* The end: the phone is a door. Out of the tab order until it shows. */}
          <div
            className={
              outro < 0.5
                ? 'pointer-events-none absolute inset-x-0 top-0'
                : 'absolute inset-x-0 top-0'
            }
            style={{ opacity: outro, transform: `translateY(${(1 - outro) * 16 + 72}px)` }}
          >
            <Link
              href={href}
              tabIndex={outro < 0.5 ? -1 : undefined}
              className="group inline-flex flex-col items-center"
            >
              <span className="text-gold-700 font-mono text-xs tracking-[0.2em]">{end}</span>
              <span
                dir="auto"
                className="text-ink-900 group-hover:text-gold-700 mt-1.5 text-2xl underline-offset-4 group-hover:underline"
              >
                {openLabel}
              </span>
            </Link>
          </div>
        </div>

        <div aria-hidden className="bg-ink-100 absolute inset-x-0 bottom-8 mx-auto h-px max-w-xs">
          <div
            className="bg-gold-500 h-full origin-left rtl:origin-right"
            style={{ transform: `scaleX(${p})` }}
          />
        </div>
      </div>
    </section>
  )
}
