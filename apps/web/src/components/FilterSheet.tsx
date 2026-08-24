'use client'

import { useEffect, useRef, useState } from 'react'
import { GOVERNORATES, PRICE_RANGES, type Labelled } from '@vardenia/core'
import type { Locale } from '@vardenia/i18n'
import { useRouter } from '../i18n/routing'
import { amenityLabel, districtLabel, subcategoryLabel } from '../lib/labels'
import { displayAmenities, filterHref, type FilterState } from './ListingFilters'

/**
 * The rest of the filters, in a sheet.
 *
 * # Why a sheet and not more rows
 *
 * There are twenty-nine filters: fifty-one possible kinds, eight governorates,
 * twenty-eight districts, four price bands and sixteen amenities. Laid out as
 * rows of chips they were four wrapping lines that pushed the actual listings
 * off the screen, and on a 375px phone the amenities row alone was six lines.
 *
 * So the two facets a reader uses most stay in the bar, and the rest move
 * here. The button carries a count, because the one thing that must be visible
 * from across the page is how many filters are currently narrowing the result.
 *
 * # The URL is still the source of truth
 *
 * This is the part that is easy to get wrong. Every filtered view on this site
 * has to be a real URL: shareable, indexable, and printable beside a QR code.
 * That is why FilterChip is a link rather than a button.
 *
 * A modal cannot navigate on every tap without closing itself, so this holds
 * *pending* state while it is open and navigates once, on Apply. The applied
 * state still lives entirely in the query string - nothing is kept in React
 * that outlives the sheet, and reloading the page reproduces the same view.
 *
 * # Why a native dialog
 *
 * `showModal()` gives a focus trap, Escape, an inert background and a
 * `::backdrop` for free. Every one of those is something a hand-rolled div
 * gets subtly wrong, and the focus trap in particular is the difference between
 * a keyboard user being able to leave and not.
 *
 * # Without JavaScript
 *
 * The button does nothing, and the inline chips in the bar are still links, so
 * filtering by kind and governorate keeps working. Price and amenities become
 * unreachable, which is a degradation rather than a break. Making the full set
 * work without JavaScript means going back to the wrapping rows this replaced.
 */

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-ink-100 border-b py-5 last:border-b-0">
      <h3 className="text-ink-500 font-mono text-[11px] font-medium uppercase tracking-[0.14em]">
        {title}
      </h3>
      <div className="mt-3.5 flex flex-wrap gap-2">{children}</div>
    </div>
  )
}

/** A chip inside the sheet. A button, because nothing navigates until Apply. */
function Toggle({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={
        active
          ? 'bg-cedar-900 text-surface-base rounded-full px-4 py-2 text-sm transition-transform active:scale-[0.97]'
          : 'border-ink-100 text-ink-700 hover:border-ink-300 rounded-full border px-4 py-2 text-sm transition-[border-color,transform] active:scale-[0.97]'
      }
    >
      {children}
    </button>
  )
}

export function FilterSheet({
  base,
  state,
  subcategories,
  locale,
}: {
  base: string
  state: FilterState
  subcategories: readonly { slug: string }[]
  locale: Locale
}) {
  const ar = locale === 'ar'
  const router = useRouter()
  const ref = useRef<HTMLDialogElement>(null)
  const [open, setOpen] = useState(false)

  /**
   * Pending state, seeded from the URL every time the sheet opens.
   *
   * Seeded in the click handler rather than in an effect. Two reasons, and the
   * second is the one that matters: setting state from inside an effect is what
   * the React Compiler's `set-state-in-effect` rule exists to catch, and the
   * open transition is a real event with an obvious place to put the work.
   *
   * Seeding on open rather than once on mount also matters: a reader can change
   * a governorate chip in the bar while the sheet is closed, and reopening it
   * must show that rather than a stale copy from the first render.
   */
  const [draft, setDraft] = useState<FilterState>(state)

  const openSheet = () => {
    setDraft(state)
    setOpen(true)
  }

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return

    if (open) {
      if (!dialog.open) dialog.showModal()
      // The page behind must not scroll while a sheet covers it, or a phone
      // scrolls the list instead of the sheet's own overflowing content.
      document.body.style.overflow = 'hidden'
    } else {
      if (dialog.open) dialog.close()
      document.body.style.overflow = ''
    }

    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  /** Escape and the backdrop close the dialog natively; keep React in step. */
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    const onClose = () => setOpen(false)
    dialog.addEventListener('close', onClose)
    return () => dialog.removeEventListener('close', onClose)
  }, [])

  const districts =
    GOVERNORATES.find((g) => g.slug === draft.governorate)?.districts ?? ([] as Labelled[])

  /** How many facets are narrowing the result right now, from the URL. */
  const count =
    (state.subcategory ? 1 : 0) +
    (state.governorate ? 1 : 0) +
    (state.district ? 1 : 0) +
    (state.priceRange ? 1 : 0) +
    state.amenities.length

  const set = (change: Partial<FilterState>) =>
    setDraft((current) => {
      const next = { ...current, ...change }
      // Same rule as filterHref: a district belongs to one governorate, so
      // changing the governorate cannot keep it.
      if ('governorate' in change && change.governorate !== current.governorate) {
        next.district = undefined
      }
      return next
    })

  const toggleAmenity = (slug: string) =>
    setDraft((current) => ({
      ...current,
      amenities: current.amenities.includes(slug)
        ? current.amenities.filter((a) => a !== slug)
        : [...current.amenities, slug],
    }))

  const apply = () => {
    setOpen(false)
    router.push(filterHref(base, draft, {}))
  }

  const clear = () =>
    setDraft({ amenities: [] })

  return (
    <>
      <button
        type="button"
        onClick={openSheet}
        className="bg-cedar-900 text-surface-base hover:bg-cedar-700 inline-flex h-11 shrink-0 items-center gap-2 rounded-full px-5 text-sm font-medium transition-[background-color,transform] active:scale-[0.97]"
      >
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.6}
          strokeLinecap="round"
          className="size-4"
        >
          <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />
        </svg>
        {ar ? 'الفلاتر' : 'Filters'}
        {count > 0 ? (
          <span className="bg-gold-500 text-cedar-900 inline-flex min-w-[19px] items-center justify-center rounded-full px-1.5 font-mono text-[11px] font-medium">
            {count}
          </span>
        ) : null}
      </button>

      {/*
        Centred on a laptop, anchored to the bottom edge on a phone, where a
        thumb rests. `max-h` plus an overflowing body rather than a tall dialog,
        so the Apply button never scrolls out of reach.
      */}
      <dialog
        ref={ref}
        aria-label={ar ? 'الفلاتر' : 'Filters'}
        className="bg-surface-base text-ink-900 backdrop:bg-ink-950/50 m-0 w-full max-w-none rounded-t-xl p-0 shadow-2xl backdrop:backdrop-blur-[2px] sm:mx-auto sm:my-auto sm:max-w-xl sm:rounded-lg"
        style={{
          // The native dialog centres itself with `inset: 0; margin: auto`.
          // On a phone we want it pinned to the bottom instead, which needs a
          // real position rather than a utility that the UA stylesheet beats.
          marginTop: 'auto',
          marginBottom: 0,
          maxHeight: '88vh',
        }}
      >
        <div className="flex max-h-[88vh] flex-col sm:max-h-[80vh]">
          {/* The grab handle is a phone affordance and noise on a laptop. */}
          <span
            aria-hidden
            className="bg-ink-100 mx-auto mt-2.5 block h-1 w-9 shrink-0 rounded-full sm:hidden"
          />

          <div className="border-ink-100 flex shrink-0 items-center justify-between gap-4 border-b px-6 py-4">
            <h2 className="text-xl">{ar ? 'الفلاتر' : 'Filters'}</h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={ar ? 'إغلاق' : 'Close filters'}
              className="text-ink-500 hover:bg-surface-sunken hover:text-ink-900 grid size-9 place-items-center rounded-full transition-colors"
            >
              <svg
                aria-hidden
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                className="size-4"
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto overscroll-contain px-6">
            {subcategories.length > 0 ? (
              <Group title={ar ? 'النوع' : 'Kind'}>
                {subcategories.map((child) => (
                  <Toggle
                    key={child.slug}
                    active={draft.subcategory === child.slug}
                    onClick={() =>
                      set({
                        subcategory:
                          draft.subcategory === child.slug ? undefined : child.slug,
                      })
                    }
                  >
                    {subcategoryLabel(child.slug, locale)}
                  </Toggle>
                ))}
              </Group>
            ) : null}

            {/* Only shown once a governorate is chosen, because a flat list of
                twenty-eight districts across eight governorates is not a
                choice anybody can make. */}
            {districts.length > 1 ? (
              <Group title={ar ? 'القضاء' : 'District'}>
                {districts.map((d) => (
                  <Toggle
                    key={d.slug}
                    active={draft.district === d.slug}
                    onClick={() =>
                      set({ district: draft.district === d.slug ? undefined : d.slug })
                    }
                  >
                    {districtLabel(d.slug, locale)}
                  </Toggle>
                ))}
              </Group>
            ) : null}

            {/* A segmented control rather than chips: the four bands are one
                scale, and chips would imply they can be combined. */}
            <Group title={ar ? 'السعر' : 'Price'}>
              <div
                className="border-ink-100 flex overflow-hidden rounded-md border"
                role="group"
                aria-label={ar ? 'السعر' : 'Price'}
              >
                {PRICE_RANGES.map((p) => (
                  <button
                    key={p.slug}
                    type="button"
                    aria-pressed={draft.priceRange === p.slug}
                    onClick={() =>
                      set({ priceRange: draft.priceRange === p.slug ? undefined : p.slug })
                    }
                    className={`border-ink-100 border-e px-4 py-2 font-mono text-sm transition-colors last:border-e-0 ${
                      draft.priceRange === p.slug
                        ? 'bg-cedar-900 text-gold-300'
                        : 'text-ink-700 hover:bg-surface-sunken'
                    }`}
                    title={ar ? p.ar : p.en}
                  >
                    {p.marks}
                  </button>
                ))}
              </div>
            </Group>

            <Group title={ar ? 'المرافق' : 'Features'}>
              {displayAmenities.map((a) => (
                <Toggle
                  key={a.slug}
                  active={draft.amenities.includes(a.slug)}
                  onClick={() => toggleAmenity(a.slug)}
                >
                  {amenityLabel(a.slug, locale)}
                </Toggle>
              ))}
            </Group>
          </div>

          <div className="border-ink-100 bg-surface-raised flex shrink-0 items-center justify-between gap-4 border-t px-6 py-3.5 pb-[calc(0.875rem+env(safe-area-inset-bottom,0px))]">
            <button
              type="button"
              onClick={clear}
              className="text-ink-500 hover:text-ink-900 text-sm underline underline-offset-4 transition-colors"
            >
              {ar ? 'مسح الكل' : 'Clear all'}
            </button>
            <button
              type="button"
              onClick={apply}
              className="bg-cedar-900 text-surface-base hover:bg-cedar-700 h-11 flex-1 rounded-md px-6 text-sm font-medium transition-[background-color,transform] active:scale-[0.985] sm:max-w-[240px]"
            >
              {ar ? 'عرض النتائج' : 'Show results'}
            </button>
          </div>
        </div>
      </dialog>
    </>
  )
}
