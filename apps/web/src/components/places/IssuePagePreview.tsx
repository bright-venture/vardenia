'use client'

import { useMemo } from 'react'
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
  return (
    <MagazinePageView
      page={entry}
      businesses={businesses}
      regionName={region ? labels.governorate(region.governorate) : null}
      highlight={number}
      labels={labels}
      dir={dirFor(locale)}
      imageFor={imageFor}
    />
  )
}
