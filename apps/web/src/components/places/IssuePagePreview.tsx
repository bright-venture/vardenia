'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { dirFor, type Locale } from '@vardenia/i18n'
import { regionOfPage } from '@vardenia/core/magazine-view'
import { MagazinePageView } from '../magazine/MagazinePageView'
import { buildMagazineLabels } from '../magazine/magazine-labels'
import { pageImagesFor } from '../magazine/page-images'
import { mergeRegions } from '../magazine/regions'
import { useMagazine } from '../magazine/use-magazine'
import type { MagazineBusiness } from '../magazine/types'
import { PAGE_RATIO } from './preview-model'

/**
 * The form's preview (27 November 2026): the page of the chosen issue that
 * holds the number the owner picked, drawn from the issue's own template, with
 * the owner's details on their slot as they type. For the All Lebanon
 * magazine that is the designer's printed page (magazine/page-images); for any
 * other issue, the page as the magazine viewer draws it. Other businesses
 * already on the page show as they do in the viewer.
 *
 * Before an issue and a number are chosen, a blank page with a line saying
 * what to pick.
 */
export function IssuePagePreview({
  issueId,
  number,
  draft,
  locale,
}: {
  issueId: number | null
  number: number | null
  /** The owner's business as typed so far, placed on `number`. */
  draft: MagazineBusiness | null
  locale: Locale
}) {
  const t = useTranslations('magazineViewer')
  const formT = useTranslations('magazinePlaces')
  const layoutT = useTranslations('magazinePlaces.form.layouts')
  const { data, loading } = useMagazine(issueId, locale)
  const labels = useMemo(() => buildMagazineLabels(t, layoutT, locale), [t, layoutT, locale])

  const entry = useMemo(
    () =>
      number === null
        ? null
        : (data?.pages.find(
            (p) => p.kind === 'listings' && p.slots.some((s) => s.number === number),
          ) ?? null),
    [data, number],
  )
  const businesses = useMemo(() => {
    const map = new Map<number, MagazineBusiness>(
      (data?.businesses ?? []).map((b) => [b.number, b]),
    )
    if (draft && number !== null) map.set(number, { ...draft, number })
    return map
  }, [data, draft, number])
  const imageFor = useMemo(() => (data ? pageImagesFor(data.regions, data.pages) : null), [data])
  // A full spread is two pages wide: shown one page at a time, full size, with
  // a switch between its two pages. Back to its first page when the spread changes.
  const [shown, setShown] = useState<{ page: number; side: 0 | 1 } | null>(null)
  const side: 0 | 1 = entry && shown?.page === entry.page ? shown.side : 0

  if (!entry || !data) {
    const hint = !issueId
      ? formT('form.previewChooseIssue')
      : loading
        ? t('loading')
        : formT('form.previewChoosePage')
    return (
      <div
        style={{ aspectRatio: PAGE_RATIO }}
        className="bg-surface-base border-ink-100 text-ink-500 flex w-full items-center justify-center border p-6 text-center text-sm shadow-lg"
        data-preview-empty
      >
        {hint}
      </div>
    )
  }

  const region = regionOfPage(mergeRegions(data.regions), entry.page)
  const dir = dirFor(locale)
  const view = (
    <MagazinePageView
      page={entry}
      businesses={businesses}
      regionName={region ? labels.governorate(region.governorate) : null}
      highlight={number}
      labels={labels}
      dir={dir}
      imageFor={imageFor}
    />
  )
  if (entry.kind !== 'listings' || entry.span !== 2) return view

  // The spread's first page sits on the start side (left in English, right in
  // Arabic), so which half to slide into view depends on the direction.
  const offset = (side === 0) === (dir === 'rtl') ? '-50%' : '0%'
  const pages = [entry.page, entry.page + 1] as const
  return (
    <div className="flex flex-col gap-3" data-spread-preview>
      <div style={{ aspectRatio: PAGE_RATIO }} className="w-full overflow-hidden" dir="ltr">
        <div
          className="w-[200%] transition-transform duration-200 motion-reduce:transition-none"
          style={{ transform: `translateX(${offset})` }}
          data-side={side}
        >
          {view}
        </div>
      </div>
      <div
        role="group"
        aria-label={formT('form.previewSpread')}
        className="flex justify-center gap-2"
      >
        {pages.map((page, i) => {
          const active = side === i
          return (
            <button
              key={page}
              type="button"
              aria-pressed={active}
              onClick={() => setShown({ page: entry.page, side: i as 0 | 1 })}
              className={`focus-visible:outline-gold-300 inline-flex min-h-11 items-center px-4 text-sm tabular-nums transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
                active
                  ? 'bg-cedar-900 text-surface-base'
                  : 'border-ink-100 text-ink-900 hover:border-ink-300 hover:bg-surface-raised border'
              }`}
            >
              {t('page', { page })}
            </button>
          )
        })}
      </div>
    </div>
  )
}
