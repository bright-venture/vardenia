'use client'

import { useId } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { NOTICE_INFO } from '../formStyles'
import { formatMoney } from './flow-client'
import type { LayoutIssue, NumbersSlot } from './use-place-numbers'

/**
 * The free slots of the chosen layout in a governorate, one button each.
 *
 * A slot is named by where it sits, as text only: "Page 62, position 3",
 * "Page 12" (one slot on the page) or "Pages 62-63" (a spread). Choosing one
 * picks its listing number. Taken slots are not listed at all: the route only
 * sends the free ones. Each issue's heading says its title, the layout's price
 * and how many are free.
 *
 * Buttons with `aria-pressed` rather than radio inputs: a long group of radios
 * would make arrow keys the only way through, and Tab still moves through these
 * one by one.
 *
 * When no issue offers the layout here (`issues` empty) or every slot of it is
 * taken, it says so; the form keeps Next disabled in both cases.
 */
export function NumberPicker({
  issues,
  value,
  selectedIssue = null,
  onChange,
}: {
  issues: LayoutIssue[]
  value: number | null
  /** The issue `value` belongs to; null matches the first issue that lists it. */
  selectedIssue?: number | null
  onChange: (issueId: number, n: number) => void
}) {
  const t = useTranslations('magazinePlaces.numbers')
  const locale = useLocale()
  const ids = useId()

  if (issues.length === 0) {
    return (
      <p className={NOTICE_INFO} role="status">
        {t('noneForLayout')}
      </p>
    )
  }

  if (!issues.some((issue) => issue.slots.length > 0)) {
    return (
      <p className={NOTICE_INFO} role="status">
        {t('noneFree')}
      </p>
    )
  }

  const slotText = (slot: NumbersSlot) =>
    slot.lastPage > slot.page
      ? t('slotSpread', { page: slot.page, lastPage: slot.lastPage })
      : slot.position === null
        ? t('slotPage', { page: slot.page })
        : t('slotPosition', { page: slot.page, position: slot.position })

  const pressedIssue =
    value === null
      ? null
      : (selectedIssue ??
        issues.find((i) => i.slots.some((s) => s.number === value))?.issueId ??
        null)

  return (
    <div className="flex flex-col gap-5">
      {issues.map((issue) => {
        const headingId = `${ids}-${issue.issueId}`
        return (
          <div key={issue.issueId} role="group" aria-labelledby={headingId}>
            <p id={headingId} className="text-ink-700 text-sm">
              {issue.issueTitle ? <span className="font-semibold">{issue.issueTitle}</span> : null}
              {issue.issueTitle ? ' · ' : null}
              {t('price', { amount: formatMoney(issue.price, issue.currency, locale) })}
              {' · '}
              {t('free', { free: issue.slots.length })}
            </p>
            {issue.slots.length > 0 ? (
              <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {issue.slots.map((slot) => {
                  const pressed = pressedIssue === issue.issueId && value === slot.number
                  return (
                    <button
                      key={slot.number}
                      type="button"
                      data-number={slot.number}
                      aria-pressed={pressed}
                      onClick={() => onChange(issue.issueId, slot.number)}
                      className={`focus-visible:outline-gold-500 flex min-h-11 items-center justify-center border px-2 text-sm tabular-nums transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
                        pressed
                          ? 'border-cedar-900 bg-cedar-900 text-surface-base font-semibold'
                          : 'border-ink-100 bg-surface-base text-ink-900 hover:border-ink-500'
                      }`}
                    >
                      {slotText(slot)}
                    </button>
                  )
                })}
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
