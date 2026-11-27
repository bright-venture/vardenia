'use client'

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { useTranslations } from 'next-intl'
import { dirFor, type Locale } from '@vardenia/i18n'
import { regionOfPage, toSpreads, type MagazinePage } from '@vardenia/core/magazine-view'
import { MagazinePageView } from './MagazinePageView'
import { buildMagazineLabels } from './magazine-labels'
import { mergeRegions } from './regions'
import { useMagazine } from './use-magazine'
import type { MagazineBusiness } from './types'

/**
 * A read-only flipbook of one issue. Two pages side by side from `sm` up (the
 * reader's right-to-left order flips them), one page below. Only the current
 * view is drawn. The position is kept as a page number, so a resize between
 * one and two pages keeps the reader where they were.
 */

const WIDE = '(min-width: 640px)'
const subscribe = (notify: () => void) => {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {}
  const list = window.matchMedia(WIDE)
  list.addEventListener('change', notify)
  return () => list.removeEventListener('change', notify)
}
const wideNow = () =>
  typeof window === 'undefined' || !window.matchMedia ? true : window.matchMedia(WIDE).matches

const covers = (entry: MagazinePage, page: number) =>
  page >= entry.page && page < entry.page + (entry.kind === 'listings' ? entry.span : 1)

const button =
  'focus-visible:outline-gold-500 border-ink-100 bg-surface-raised text-ink-900 hover:bg-ink-100 inline-flex min-h-11 min-w-11 items-center justify-center border px-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 aria-disabled:opacity-40'

export function MagazineViewer({
  issueId,
  locale,
  highlight,
}: {
  issueId: number
  locale: Locale
  highlight: number | null
}) {
  const t = useTranslations('magazineViewer')
  const layoutT = useTranslations('magazinePlaces.form.layouts')
  const { data, error, gone, loading, retry } = useMagazine(issueId, locale)
  const wide = useSyncExternalStore(subscribe, wideNow, () => true)
  const dir = dirFor(locale)
  const rtl = dir === 'rtl'
  const [chosen, setChosen] = useState<number | null>(null)
  const [jump, setJump] = useState('')

  const spreads = useMemo(() => (data ? toSpreads(data.pages) : []), [data])
  const regions = useMemo(() => mergeRegions(data?.regions ?? []), [data])
  const businesses = useMemo(
    () => new Map<number, MagazineBusiness>((data?.businesses ?? []).map((b) => [b.number, b])),
    [data],
  )
  const labels = useMemo(
    () =>
      buildMagazineLabels(
        (key, values) => t(key as never, values as never),
        (key) => layoutT(key as never),
        locale,
      ),
    [t, layoutT, locale],
  )

  // Where to open: the page that holds `highlight`, else the first page.
  const start = useMemo(() => {
    const pages = data?.pages ?? []
    if (highlight !== null) {
      const own = pages.find(
        (p) => p.kind === 'listings' && p.slots.some((s) => s.number === highlight),
      )
      if (own) return own.page
    }
    return pages[0]?.page ?? 1
  }, [data, highlight])

  const page = chosen ?? start
  const units = useMemo<MagazinePage[][]>(
    () => (wide ? spreads : (data?.pages ?? []).map((p) => [p])),
    [wide, spreads, data],
  )
  const index = Math.max(
    0,
    units.findIndex((u) => u.some((e) => covers(e, page))),
  )
  const shown = units[index] ?? []
  const first = shown[0]
  const last = shown[shown.length - 1]

  const go = useCallback(
    (to: number) => {
      const target = units[Math.min(Math.max(to, 0), units.length - 1)]?.[0]
      if (target) setChosen(target.page)
    },
    [units],
  )
  const goPage = useCallback(
    (n: number) => {
      const entry = data?.pages.find((p) => covers(p, n))
      if (entry) setChosen(entry.page)
    },
    [data],
  )
  const step = useCallback((direction: 1 | -1) => go(index + direction), [go, index])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return
      const target = event.target as HTMLElement | null
      if (target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      const forward = (event.key === 'ArrowRight') !== rtl
      step(forward ? 1 : -1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step, rtl])

  if (!data) {
    if (gone)
      return (
        <p role="status" className="text-ink-500 py-10 text-center" dir={dir}>
          {t('unavailable')}
        </p>
      )
    if (error)
      return (
        <div role="alert" className="text-ink-900 py-10 text-center" dir={dir}>
          <p>{t('error')}</p>
          <button type="button" className={`${button} mt-4`} onClick={retry}>
            {t('retry')}
          </button>
        </div>
      )
    return (
      <p role="status" className="text-ink-500 py-10 text-center" dir={dir}>
        {loading ? t('loading') : t('empty')}
      </p>
    )
  }
  if (!first || !last) {
    return (
      <p className="text-ink-500 py-10 text-center" dir={dir}>
        {t('empty')}
      </p>
    )
  }

  const total = data.pages.reduce((n, p) => n + (p.kind === 'listings' ? p.span : 1), 0)
  const from = first.page
  const to = last.page + (last.kind === 'listings' ? last.span : 1) - 1
  const position = from === to ? t('pageOf', { from, total }) : t('pagesOf', { from, to, total })
  const regionOf = (entry: MagazinePage) => {
    const region = regionOfPage(regions, entry.page)
    return region ? labels.governorate(region.governorate) : null
  }
  // A single page beside no neighbour (the first, an odd last) keeps one page's width.
  const lone = wide && shown.length === 1 && (first.kind !== 'listings' || first.span === 1)
  const currentRegion = regionOfPage(regions, from)
  const arrows = rtl ? ['›', '‹'] : ['‹', '›']

  return (
    <section
      dir={dir}
      lang={locale}
      aria-label={t('viewerLabel')}
      className="mx-auto w-full max-w-5xl"
    >
      <h2 className="font-display text-ink-900 mb-3 text-xl">{data.issue.title}</h2>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {regions.length > 1 ? (
          <label className="text-ink-900 flex items-center gap-2 text-sm">
            <span>{t('region')}</span>
            <select
              className="border-ink-100 bg-surface-raised focus-visible:outline-gold-500 min-h-11 border px-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              aria-label={t('jumpRegion')}
              value=""
              onChange={(event) => {
                const region = regions.find((r) => r.governorate === event.target.value)
                if (region) goPage(region.firstPage)
              }}
            >
              <option value="">
                {currentRegion ? labels.governorate(currentRegion.governorate) : t('jumpRegion')}
              </option>
              {regions.map((r) => (
                <option key={r.governorate} value={r.governorate}>
                  {labels.governorate(r.governorate)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <form
          className="flex items-center gap-2 text-sm"
          onSubmit={(event) => {
            event.preventDefault()
            const n = /^\d{1,6}$/.test(jump.trim()) ? Number(jump.trim()) : 0
            if (n >= 1 && n <= total) goPage(n)
          }}
        >
          <label className="text-ink-900 flex items-center gap-2">
            <span>{t('pageInput')}</span>
            <input
              inputMode="numeric"
              value={jump}
              onChange={(event) => setJump(event.target.value)}
              className="border-ink-100 bg-surface-raised focus-visible:outline-gold-500 min-h-11 w-20 border px-2 tabular-nums focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            />
          </label>
          <button type="submit" className={button}>
            {t('jump')}
          </button>
        </form>
      </div>

      <div className="flex items-center gap-2 sm:gap-4">
        <button
          type="button"
          className={button}
          aria-label={t('prev')}
          aria-disabled={index <= 0}
          onClick={() => step(-1)}
        >
          <span aria-hidden>{arrows[0]}</span>
        </button>
        <div
          data-spread
          className={`grid min-w-0 flex-1 gap-0 ${
            shown.length > 1
              ? 'grid-cols-2'
              : lone
                ? 'mx-auto max-w-[50%] grid-cols-1'
                : 'grid-cols-1'
          }`}
        >
          {shown.map((entry) => (
            <MagazinePageView
              key={entry.page}
              page={entry}
              businesses={businesses}
              regionName={regionOf(entry)}
              highlight={highlight}
              labels={labels}
              dir={dir}
            />
          ))}
        </div>
        <button
          type="button"
          className={button}
          aria-label={t('next')}
          aria-disabled={index >= units.length - 1}
          onClick={() => step(1)}
        >
          <span aria-hidden>{arrows[1]}</span>
        </button>
      </div>
      <p
        className="text-ink-500 mt-3 text-center text-sm tabular-nums"
        aria-live="polite"
        data-position
      >
        {position}
      </p>
    </section>
  )
}
